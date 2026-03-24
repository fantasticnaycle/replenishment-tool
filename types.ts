
export interface ForecastSegment {
  id: string;
  startDate: string;
  endDate: string;
  dailyVelocity: number;
}

export interface InboundItem {
  id: string;
  label: string;
  shipDate: string;
  transitDays: number;
  qty: number;
  type?: 'Air' | 'Sea';
}

export interface InventoryInputs {
  baseDate: string;
  initialStock: number; // Displayed as "Amazon In-stock"
  orderedNotShippedQty: number; // New: Stock at supplier/factory
  projectionDays: number;
  leadTimeSea: number;
  leadTimeAir: number;
  productionLeadTime: number; 
  fluctuationBuffer: number;
  maxStockDays: number; 
  onHandQty: number; 
  minOrderQty: number;
  regularCycleDays: number;
  allowSea: boolean;
  allowAir: boolean;
  
  // Supplier Holiday
  enableHoliday: boolean; 
  holidayStart?: string; 
  holidayEnd?: string;

  // Freight Forwarder Holiday
  enableFreightHoliday: boolean; // New
  freightHolidayStart?: string;  // New
  freightHolidayEnd?: string;    // New
}

export interface ReplenishmentAdvice {
  id: string;
  batchId?: string;
  type: 'Air' | 'Sea' | 'SalesControl';
  suggestedOrderDate?: string; 
  suggestedShipDate?: string;
  arrivalDate?: string;
  qty?: number;
  targetVelocity?: number;
  reason: string;
  isImmediate?: boolean;
  isPreOrder?: boolean; // New: Holiday pre-order flag
  deductionInfo?: {     // New: Deduction details
    pre: number;
    used: number;
    remaining: number;
  };
  dateRange?: { start: string, end: string };
}

export interface TimelineData {
  dayIndex: number;
  date: string;
  velocity: number;
  baseline: number;
  simulated: number;
  healthyLevel: number;
  arrivalQty: number;
  arrivingLabels: string[];
  arrivingBatchIds: string[];
  arrivingTypes: ('Air' | 'Sea')[];
  shortageQty: number;
  isStockout: boolean;
}

export interface OperationalAnalysis {
  type: 'stockout' | 'overstock' | 'sales_control' | 'info';
  date: string;
  message: string;
  durationDays?: number;
}

export interface ProfileData {
  inputs: InventoryInputs;
  forecasts: ForecastSegment[];
  inbounds: InboundItem[];
  plans: InboundItem[];
}

export interface SavedProfile {
  id: string;
  name: string;
  lastModified: number;
  data: ProfileData;
}
