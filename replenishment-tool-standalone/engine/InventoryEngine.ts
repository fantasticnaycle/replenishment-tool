
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import { 
  InventoryInputs, 
  ForecastSegment, 
  InboundItem, 
  ReplenishmentAdvice, 
  TimelineData,
  OperationalAnalysis
} from '../types';

dayjs.extend(isBetween);

export class InventoryEngine {
  private config: InventoryInputs;
  private forecasts: ForecastSegment[];
  private inbounds: InboundItem[];
  private plans: InboundItem[];

  constructor(
    config: InventoryInputs,
    forecasts: ForecastSegment[],
    inbounds: InboundItem[] = [],
    plans: InboundItem[] = []
  ) {
    this.config = config;
    this.forecasts = [...forecasts].sort((a, b) => dayjs(a.startDate).diff(dayjs(b.startDate)));
    this.inbounds = inbounds;
    this.plans = plans;
  }

  public getVelocityForDay(dayOffset: number): number {
    const targetDate = dayjs(this.config.baseDate).add(dayOffset, 'day');
    const currentSegment = this.forecasts.find(f => 
      (targetDate.isAfter(f.startDate) || targetDate.isSame(f.startDate, 'day')) &&
      (targetDate.isBefore(f.endDate) || targetDate.isSame(f.endDate, 'day'))
    );
    if (currentSegment) return currentSegment.dailyVelocity;

    const prevSegment = [...this.forecasts].reverse().find(f => targetDate.isAfter(f.endDate, 'day'));
    const nextSegment = this.forecasts.find(f => targetDate.isBefore(f.startDate, 'day'));

    if (!prevSegment && nextSegment) return nextSegment.dailyVelocity;
    if (prevSegment && !nextSegment) return prevSegment.dailyVelocity;
    if (prevSegment && nextSegment) {
      const gapTotalDays = dayjs(nextSegment.startDate).diff(prevSegment.endDate, 'day');
      const daysSincePrev = targetDate.diff(prevSegment.endDate, 'day');
      const velocityDiff = nextSegment.dailyVelocity - prevSegment.dailyVelocity;
      return prevSegment.dailyVelocity + (velocityDiff * (daysSincePrev / gapTotalDays));
    }
    return 0;
  }

  public getHealthyStock(dayOffset: number): number {
    let total = 0;
    for (let i = 0; i < this.config.fluctuationBuffer; i++) {
      total += this.getVelocityForDay(dayOffset + i);
    }
    return total;
  }

  private applyMOQ(qty: number): number {
    const moq = Math.max(1, this.config.minOrderQty || 10);
    if (qty <= 0) return 0;
    return Math.ceil(qty / moq) * moq;
  }

  private getNextCycleDemand(startDayIndex: number, days: number): number {
    let sum = 0;
    for(let i=0; i<days; i++) {
      sum += this.getVelocityForDay(startDayIndex + i);
    }
    return sum;
  }

  public calculateAdvice(): ReplenishmentAdvice[] {
    const advice: ReplenishmentAdvice[] = [];
    const today = dayjs(this.config.baseDate);
    const virtualArrivals = new Map<number, number>();
    
    let batchCounter = 1;
    let lastEmergencyRecoveryDay = -1;
    let remainingOnHand = Number(this.config.onHandQty) || 0;
    let currentOrderedNotShipped = Number(this.config.orderedNotShippedQty) || 0;

    const existingInboundMap = new Map<number, number>();
    [...this.inbounds, ...this.plans].forEach(item => {
       const arrivalDate = dayjs(item.shipDate).add(item.transitDays, 'day');
       const diffDays = arrivalDate.diff(today, 'day');
       if (diffDays >= 0 && diffDays < this.config.projectionDays) {
         existingInboundMap.set(diffDays, (existingInboundMap.get(diffDays) || 0) + item.qty);
       }
    });

    let runningStock = this.config.initialStock;

    // Phase 1: Replenishment logic
    for (let i = 0; i < this.config.projectionDays; i++) {
      const targetDate = today.add(i, 'day');
      const dailyVelocity = this.getVelocityForDay(i);

      runningStock -= dailyVelocity;
      if (existingInboundMap.has(i)) runningStock += existingInboundMap.get(i)!;
      if (virtualArrivals.has(i)) runningStock += virtualArrivals.get(i)!;
      if (runningStock < 0) runningStock = 0;

      const healthyLevel = this.getHealthyStock(i);
      const getLetterId = (num: number) => String.fromCharCode(65 + ((num - 1) % 26));
      
      const maxAllowedStock = dailyVelocity * this.config.maxStockDays;
      const getMaxQty = (current: number) => Math.max(0, maxAllowedStock - current);

      const isSeaAllowed = this.config.allowSea;
      const isAirAllowed = this.config.allowAir;
      const isHybrid = isSeaAllowed && isAirAllowed;

      const isSeaArrivalPossible = isSeaAllowed && i >= this.config.leadTimeSea;
      const isAirArrivalPossible = isAirAllowed && i >= this.config.leadTimeAir;

      // --- Holiday & Date Logic Core ---
      const calculateDates = (idealArrivalDate: dayjs.Dayjs, leadTime: number, type: 'Air' | 'Sea') => {
        // 1. Just-in-Time Ideal Dates
        const idealShipDate = idealArrivalDate.subtract(leadTime, 'day');
        const idealOrderDate = idealShipDate.subtract(this.config.productionLeadTime, 'day');

        let finalOrderDate = idealOrderDate;
        let finalShipDate = idealShipDate;
        let isPreOrder = false;
        let freightHolidayAffected = false;

        // --- Freight Forwarder Holiday Check (Ship Date) ---
        if (this.config.enableFreightHoliday && this.config.freightHolidayStart && this.config.freightHolidayEnd) {
             const fStart = dayjs(this.config.freightHolidayStart);
             const fEnd = dayjs(this.config.freightHolidayEnd);
             
             // If Ship Date falls within Freight Holiday, move it BEFORE the holiday.
             // Also check if we are already past that date? Assuming we can plan ahead.
             if (finalShipDate.isBetween(fStart, fEnd, 'day', '[]')) {
                 finalShipDate = fStart.subtract(1, 'day');
                 freightHolidayAffected = true;
                 
                 // If we move Ship Date, we must also move Order Date to match production time
                 finalOrderDate = finalShipDate.subtract(this.config.productionLeadTime, 'day');
             }
        }

        // --- Supplier Holiday Check (Order Date / Production Time) ---
        if (this.config.enableHoliday && this.config.holidayStart && this.config.holidayEnd) {
           const hStart = dayjs(this.config.holidayStart);
           const hEnd = dayjs(this.config.holidayEnd);

           // Logic Update: We must ensure goods are produced BEFORE holiday.
           // Production Finish Date = Order Date + Production Time
           const productionFinishDate = finalOrderDate.add(this.config.productionLeadTime, 'day');
           
           // If Production finishes INSIDE holiday, or AFTER holiday start (but Order was before end),
           // we basically need to finish BEFORE holiday start.
           // Simpler check: If (OrderDate is in Holiday) OR (ProductionFinish overlaps HolidayStart)
           
           const isOrderInHoliday = finalOrderDate.isBetween(hStart, hEnd, 'day', '[]');
           const isProductionOverlapping = productionFinishDate.isAfter(hStart, 'day') && finalOrderDate.isBefore(hEnd, 'day');

           if (isOrderInHoliday || isProductionOverlapping) {
              // Move Order Date so that Production Finishes 1 day before Holiday Start
              finalOrderDate = hStart.subtract(this.config.productionLeadTime + 1, 'day');
           }

           // Pre-order Flag Logic:
           // "Only mark as Pre-order if Ship Date is AFTER Holiday Start"
           if (finalOrderDate.isBefore(idealOrderDate) && finalShipDate.isAfter(hStart)) {
              isPreOrder = true;
           }
        }
        
        return {
           orderDate: finalOrderDate,
           shipDate: finalShipDate,
           arrivalDate: finalShipDate.add(leadTime, 'day'),
           isPreOrder,
           freightHolidayAffected
        };
      };

      // 1. Sea Replenishment
      if (isSeaArrivalPossible && runningStock < healthyLevel) {
          // Pre-calc to check for Freight Holiday impact on Max Stock
          const tempDates = calculateDates(targetDate, this.config.leadTimeSea, 'Sea');
          
          const cycleStock = this.getNextCycleDemand(i, this.config.regularCycleDays);
          let neededQty = this.applyMOQ(healthyLevel - runningStock + cycleStock);
          
          // STRICT Max Stock Check UNLESS Freight Holiday forced an early shipment
          if (!tempDates.freightHolidayAffected) {
             neededQty = Math.min(neededQty, this.applyMOQ(getMaxQty(runningStock)));
          }

          if (neededQty > (dailyVelocity * 2)) {
            // Check Ordered Not Shipped
            let deductionInfo = undefined;
            if (currentOrderedNotShipped > 0) {
              const used = Math.min(neededQty, currentOrderedNotShipped);
              const pre = currentOrderedNotShipped;
              currentOrderedNotShipped -= used;
              deductionInfo = { pre, used, remaining: currentOrderedNotShipped };
              
              let onsShipDate = targetDate.subtract(this.config.leadTimeSea, 'day');
              // Check freight holiday for ONS too
               if (this.config.enableFreightHoliday && this.config.freightHolidayStart && this.config.freightHolidayEnd) {
                   const fStart = dayjs(this.config.freightHolidayStart);
                   const fEnd = dayjs(this.config.freightHolidayEnd);
                   if (onsShipDate.isBetween(fStart, fEnd, 'day', '[]')) {
                       onsShipDate = fStart.subtract(1, 'day');
                   }
               }
              if (onsShipDate.isBefore(today)) onsShipDate = today;

              advice.push({
                id: `sea_ons_${i}`, batchId: getLetterId(batchCounter++), type: 'Sea',
                suggestedOrderDate: onsShipDate.format('YYYY-MM-DD'), 
                suggestedShipDate: onsShipDate.format('YYYY-MM-DD'),
                arrivalDate: onsShipDate.add(this.config.leadTimeSea, 'day').format('YYYY-MM-DD'),
                qty: used, reason: `库存抵扣：使用已下单未发货库存。`,
                deductionInfo
              });
              
              const arrDay = onsShipDate.add(this.config.leadTimeSea, 'day').diff(today, 'day');
              if (arrDay >= 0) virtualArrivals.set(arrDay, (virtualArrivals.get(arrDay)||0) + used);
              runningStock += used;
              neededQty -= used;
            }

            if (neededQty > 0) {
               const dates = calculateDates(targetDate, this.config.leadTimeSea, 'Sea');
               let finalArrivalIndex = dates.arrivalDate.diff(today, 'day');

               let actualQty = neededQty;
               let immediateFlag = false;
               
               if (dates.orderDate.isBefore(today, 'day')) {
                  immediateFlag = true;
               }

               let finalReason = dates.isPreOrder 
                   ? `提前采购：避开假期，分批做货。` 
                   : `海运补货：维持库存储备。`;
               
               if (dates.freightHolidayAffected) {
                   finalReason += ` (受货代假期影响提前发货，忽略上限)`;
               }
               
               if (immediateFlag) {
                   if (remainingOnHand < actualQty) { 
                       actualQty = remainingOnHand; 
                       finalReason = `立即发货${remainingOnHand}（工厂现货不足）。`; 
                       remainingOnHand = 0; 
                   } else { 
                       remainingOnHand -= actualQty; 
                       finalReason = `工厂现货充足，立即下单发货。`; 
                   }
               }

               if (actualQty > 0) {
                  advice.push({
                    id: `sea_${i}`, batchId: getLetterId(batchCounter++), type: 'Sea',
                    suggestedOrderDate: dates.orderDate.format('YYYY-MM-DD'),
                    suggestedShipDate: dates.shipDate.format('YYYY-MM-DD'),
                    arrivalDate: dates.arrivalDate.format('YYYY-MM-DD'),
                    qty: actualQty, reason: finalReason, isImmediate: immediateFlag, isPreOrder: dates.isPreOrder
                  });
                  runningStock += actualQty;
                  virtualArrivals.set(finalArrivalIndex, (virtualArrivals.get(finalArrivalIndex) || 0) + actualQty);
               }
            }
          }
          continue; 
      }

      // 2. Air Replenishment
      if (isAirArrivalPossible) {
        const triggerLevel = isHybrid ? 0 : healthyLevel;
        if (runningStock <= triggerLevel) {
          const tempDates = calculateDates(targetDate, this.config.leadTimeAir, 'Air');

          const targetQtyLevel = isHybrid ? 0 : healthyLevel;
          const cycleDays = isHybrid ? 10 : this.config.regularCycleDays;
          let neededQty = this.applyMOQ(targetQtyLevel - runningStock + this.getNextCycleDemand(i, cycleDays));
          
          if (!tempDates.freightHolidayAffected) {
             neededQty = Math.min(neededQty, this.applyMOQ(getMaxQty(runningStock)));
          }

          if (neededQty > 0) {
            // Check Ordered Not Shipped
            let deductionInfo = undefined;
            if (currentOrderedNotShipped > 0) {
               const used = Math.min(neededQty, currentOrderedNotShipped);
               const pre = currentOrderedNotShipped;
               currentOrderedNotShipped -= used;
               deductionInfo = { pre, used, remaining: currentOrderedNotShipped };

               let onsShipDate = targetDate.subtract(this.config.leadTimeAir, 'day');
               if (this.config.enableFreightHoliday && this.config.freightHolidayStart && this.config.freightHolidayEnd) {
                   const fStart = dayjs(this.config.freightHolidayStart);
                   const fEnd = dayjs(this.config.freightHolidayEnd);
                   if (onsShipDate.isBetween(fStart, fEnd, 'day', '[]')) {
                       onsShipDate = fStart.subtract(1, 'day');
                   }
               }
               if (onsShipDate.isBefore(today)) onsShipDate = today;
               
               advice.push({
                 id: `air_ons_${i}`, batchId: getLetterId(batchCounter++), type: 'Air',
                 suggestedOrderDate: onsShipDate.format('YYYY-MM-DD'), 
                 suggestedShipDate: onsShipDate.format('YYYY-MM-DD'),
                 arrivalDate: onsShipDate.add(this.config.leadTimeAir, 'day').format('YYYY-MM-DD'),
                 qty: used, reason: `库存抵扣：使用已下单未发货库存(空运)。`,
                 deductionInfo
               });
               
               const arrDay = onsShipDate.add(this.config.leadTimeAir, 'day').diff(today, 'day');
               if (arrDay >= 0) virtualArrivals.set(arrDay, (virtualArrivals.get(arrDay)||0) + used);
               runningStock += used;
               neededQty -= used;
            }

            if (neededQty > 0) {
                const dates = calculateDates(targetDate, this.config.leadTimeAir, 'Air');
                let finalArrivalIndex = dates.arrivalDate.diff(today, 'day');

                let actualQty = neededQty;
                let immediateFlag = false;

                if (dates.orderDate.isBefore(today, 'day')) {
                    immediateFlag = true;
                }

                let finalReason = dates.isPreOrder 
                    ? `提前采购：避开假期(空运)。` 
                    : (isHybrid ? `空运应急：海运到货前缺口救急。` : `空运补货：主航道模式。`);

                if (dates.freightHolidayAffected) {
                   finalReason += ` (受货代假期影响提前发货)`;
                }

                if (immediateFlag) {
                  if (remainingOnHand < actualQty) { actualQty = remainingOnHand; finalReason = `立即发货${remainingOnHand}（工厂现货不足）。`; remainingOnHand = 0; }
                  else { remainingOnHand -= actualQty; finalReason = `现货充足，立即发货。`; }
                }

                if (actualQty > 0) {
                  advice.push({
                    id: `air_${i}`, batchId: getLetterId(batchCounter++), type: 'Air',
                    suggestedOrderDate: dates.orderDate.format('YYYY-MM-DD'),
                    suggestedShipDate: dates.shipDate.format('YYYY-MM-DD'),
                    arrivalDate: dates.arrivalDate.format('YYYY-MM-DD'),
                    qty: actualQty, reason: finalReason, isImmediate: immediateFlag, isPreOrder: dates.isPreOrder
                  });
                  runningStock += actualQty;
                  virtualArrivals.set(finalArrivalIndex, (virtualArrivals.get(finalArrivalIndex) || 0) + actualQty);
                }
            }
          }
          continue;
        }
      }

      // 3. Emergency (Short term)
      let recoveryDelay = -1;
      let rType: 'Air' | 'Sea' | null = null;
      if (isAirAllowed) { recoveryDelay = this.config.leadTimeAir; rType = 'Air'; }
      else if (isSeaAllowed) { recoveryDelay = this.config.leadTimeSea; rType = 'Sea'; }

      if (rType && i < recoveryDelay && lastEmergencyRecoveryDay !== recoveryDelay) {
          let pending = 0;
          for(let k = i + 1; k <= recoveryDelay; k++) pending += (existingInboundMap.get(k) || 0) + (virtualArrivals.get(k) || 0);
          let demandWait = 0;
          for(let k = i + 1; k <= recoveryDelay; k++) demandWait += this.getVelocityForDay(k);
          
          const projectedAtArrival = Math.max(0, runningStock + pending - demandWait);
          if (projectedAtArrival <= 0) {
             const targetLevel = (rType === 'Air' && isHybrid) ? 0 : this.getHealthyStock(recoveryDelay);
             let neededQty = this.applyMOQ(targetLevel + this.getNextCycleDemand(recoveryDelay, 10) - projectedAtArrival);
             
             // ONS consumption for emergency?
             if (currentOrderedNotShipped > 0) {
                 const used = Math.min(neededQty, currentOrderedNotShipped);
                 const pre = currentOrderedNotShipped;
                 currentOrderedNotShipped -= used;
                 
                 advice.push({
                   id: `emergency_ons_${i}`, batchId: getLetterId(batchCounter++), type: rType,
                   suggestedOrderDate: today.format('YYYY-MM-DD'),
                   suggestedShipDate: today.format('YYYY-MM-DD'),
                   arrivalDate: today.add(recoveryDelay, 'day').format('YYYY-MM-DD'),
                   qty: used, reason: `紧急发货：优先使用已下单未发货库存。`, isImmediate: true,
                   deductionInfo: { pre, used, remaining: currentOrderedNotShipped }
                 });
                 
                 virtualArrivals.set(recoveryDelay, (virtualArrivals.get(recoveryDelay)||0) + used);
                 neededQty -= used;
             }

             if (neededQty > 0) {
                 const shipDate = today;
                 const orderDate = shipDate.subtract(this.config.productionLeadTime, 'day');
                 let actualQty = neededQty;
                 let immediateFlag = false;
                 let finalReason = `紧急发货：库存即将断档，需立即采取补救措施。`;
                 
                 if (orderDate.isBefore(today, 'day')) {
                    immediateFlag = true;
                    if (remainingOnHand < actualQty) { actualQty = remainingOnHand; finalReason = `立即发货${remainingOnHand}（现货不足）。`; remainingOnHand = 0; }
                    else { remainingOnHand -= actualQty; finalReason = `现货充足，立即发货。`; }
                 }
                 if (actualQty > 0) {
                   advice.push({
                     id: `emergency_${i}`, batchId: getLetterId(batchCounter++), type: rType,
                     suggestedOrderDate: orderDate.format('YYYY-MM-DD'), suggestedShipDate: shipDate.format('YYYY-MM-DD'),
                     arrivalDate: today.add(recoveryDelay, 'day').format('YYYY-MM-DD'),
                     qty: actualQty, reason: finalReason, isImmediate: immediateFlag
                   });
                   virtualArrivals.set(recoveryDelay, (virtualArrivals.get(recoveryDelay) || 0) + actualQty);
                 }
             }
             lastEmergencyRecoveryDay = recoveryDelay;
          }
      }
    }

    // Phase 2: Proactive Multi-Phase Sales Control (unchanged)
    let simStock = this.config.initialStock;
    const allShortageDays: number[] = [];
    for(let i=0; i<this.config.projectionDays; i++) {
        const vel = this.getVelocityForDay(i);
        const inbound = (existingInboundMap.get(i) || 0) + (virtualArrivals.get(i) || 0);
        simStock += inbound - vel;
        if (simStock < 0) {
            allShortageDays.push(i);
            simStock = 0;
        }
    }

    if (allShortageDays.length > 0) {
        const gaps: number[][] = [];
        let currentGap: number[] = [];
        for (let i = 0; i < allShortageDays.length; i++) {
            if (currentGap.length === 0 || allShortageDays[i] === currentGap[currentGap.length - 1] + 1) {
                currentGap.push(allShortageDays[i]);
            } else {
                gaps.push(currentGap);
                currentGap = [allShortageDays[i]];
            }
        }
        if (currentGap.length > 0) gaps.push(currentGap);

        let lastHandledDay = 0;
        const arrivals = Array.from(new Set([...existingInboundMap.keys(), ...virtualArrivals.keys()])).sort((a,b)=>a-b);

        gaps.forEach((gap, index) => {
            const firstShortage = gap[0];
            let nextArrival = -1;
            for (const d of arrivals) {
                if (d > firstShortage) {
                    nextArrival = d;
                    break;
                }
            }

            const endOfRation = nextArrival === -1 ? this.config.projectionDays : nextArrival;
            const startOfRation = lastHandledDay; 
            const rationDuration = endOfRation - startOfRation;

            if (rationDuration > 0) {
                let initialPool = this.config.initialStock;
                for (let k = 0; k < startOfRation; k++) {
                    initialPool += (existingInboundMap.get(k) || 0) + (virtualArrivals.get(k) || 0);
                    initialPool -= this.getVelocityForDay(k);
                    if (initialPool < 0) initialPool = 0;
                }
                
                let incomingPool = 0;
                for (let k = startOfRation; k < endOfRation; k++) {
                    incomingPool += (existingInboundMap.get(k) || 0) + (virtualArrivals.get(k) || 0);
                }
                
                const totalSupply = initialPool + incomingPool;
                const dailyLimit = Math.max(0, Math.floor(totalSupply / rationDuration));

                let normalSum = 0;
                for (let k = startOfRation; k < endOfRation; k++) normalSum += this.getVelocityForDay(k);
                const normalAvg = normalSum / rationDuration;

                if (dailyLimit < normalAvg) {
                    advice.push({
                        id: `proactive_ctrl_${index}`, type: 'SalesControl',
                        reason: totalSupply <= 0 ? '库存预警：预计完全断货，建议停止销售。' : `库存预警：供不应求，建议立即启动限流。`,
                        targetVelocity: dailyLimit,
                        dateRange: { 
                            start: today.add(startOfRation, 'day').format('YYYY-MM-DD'), 
                            end: today.add(endOfRation - 1, 'day').format('YYYY-MM-DD') 
                        }
                    });
                }
                lastHandledDay = endOfRation;
            }
        });
    }

    return advice.sort((a, b) => {
        const getDate = (adv: ReplenishmentAdvice) => adv.suggestedOrderDate || adv.dateRange?.start || '9999-99-99';
        return dayjs(getDate(a)).diff(dayjs(getDate(b)));
    });
  }

  public generateTimeline(newAdvice: ReplenishmentAdvice[], useOriginalOnly: boolean = false): TimelineData[] {
    const data: TimelineData[] = [];
    const dailyArrivals = new Map<number, { qty: number, labels: string[], batchIds: string[], types: ('Air' | 'Sea')[] }>();
    const today = dayjs(this.config.baseDate);
    
    const addToMap = (dayIndex: number, qty: number, label: string, type: 'Air' | 'Sea', batchId?: string) => {
       if (dayIndex < 0 || dayIndex >= this.config.projectionDays) return;
       const curr = dailyArrivals.get(dayIndex) || { qty: 0, labels: [], batchIds: [], types: [] };
       curr.qty += qty;
       curr.labels.push(label);
       curr.types.push(type);
       if (batchId) curr.batchIds.push(batchId);
       dailyArrivals.set(dayIndex, curr);
    };

    this.inbounds.forEach(item => {
      const arrivalDate = dayjs(item.shipDate).add(item.transitDays, 'day');
      const idx = arrivalDate.diff(today, 'day');
      addToMap(idx, item.qty, `${item.label}已发${item.qty}`, item.type || 'Sea', item.label);
    });

    this.plans.forEach(item => {
      const arrivalDate = dayjs(item.shipDate).add(item.transitDays, 'day');
      const idx = arrivalDate.diff(today, 'day');
      addToMap(idx, item.qty, `${item.label}待发${item.qty}`, item.type || 'Sea', item.label);
    });

    if (!useOriginalOnly) {
      newAdvice.forEach(adv => {
        if (adv.type === 'SalesControl') return;
        if (adv.arrivalDate) {
          const idx = dayjs(adv.arrivalDate).diff(today, 'day');
          addToMap(idx, adv.qty || 0, `建议${adv.type === 'Air' ? '空运' : '海运'}${adv.batchId}${adv.qty}`, adv.type as any, adv.batchId);
        }
      });
    }

    let currentBaseline = this.config.initialStock;
    let currentSimulated = this.config.initialStock;

    for (let i = 0; i < this.config.projectionDays; i++) {
      const velocity = this.getVelocityForDay(i);
      const healthy = this.getHealthyStock(i);
      const currentDate = today.add(i, 'day');
      const dayData = dailyArrivals.get(i) || { qty: 0, labels: [], batchIds: [], types: [] };
      
      const existingInboundQty = [...this.inbounds, ...this.plans].reduce((acc, item) => {
         const d = dayjs(item.shipDate).add(item.transitDays, 'day');
         return d.isSame(currentDate, 'day') ? acc + item.qty : acc;
      }, 0);

      currentBaseline = Math.max(0, currentBaseline + existingInboundQty - velocity);
      currentSimulated = Math.max(0, currentSimulated) + dayData.qty - velocity;
      const displaySimulated = Math.max(0, currentSimulated);

      data.push({
        dayIndex: i, date: currentDate.format('MM-DD'), velocity: velocity, baseline: Math.round(currentBaseline),
        simulated: Math.round(displaySimulated), healthyLevel: Math.round(healthy), arrivalQty: dayData.qty,
        arrivingLabels: dayData.labels, arrivingBatchIds: dayData.batchIds, arrivingTypes: dayData.types,
        shortageQty: 0, isStockout: displaySimulated <= 0 && velocity > 0
      });
    }

    for (let i = 0; i < data.length; i++) {
       if (data[i].isStockout) {
           let sum = 0;
           for(let j=i; j<data.length; j++) {
               sum += data[j].velocity;
               if (j > i && data[j].arrivalQty > 0) break; 
           }
           data[i].shortageQty = sum;
       }
    }
    return data;
  }

  public runAnalysis(timeline: TimelineData[]): OperationalAnalysis[] {
    const alerts: OperationalAnalysis[] = [];
    let inStockout = false, startDate = '', duration = 0;
    for (const t of timeline) {
      if (t.isStockout) { if (!inStockout) { inStockout = true; startDate = t.date; } duration++; }
      else if (inStockout) { alerts.push({ type: 'stockout', date: startDate, message: `⚠️ 预计 ${startDate} 起断货`, durationDays: duration }); inStockout = false; duration = 0; }
    }
    if (inStockout) alerts.push({ type: 'stockout', date: startDate, message: `⚠️ 预计 ${startDate} 起断货`, durationDays: duration });
    return alerts;
  }
}
