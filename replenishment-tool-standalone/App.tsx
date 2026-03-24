
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { 
  Package, TrendingDown, Ship, Plane, 
  Settings, Calculator, AlertCircle, 
  AlertTriangle, Plus, Trash2, Calendar,
  TrendingUp, BarChart3, SlidersHorizontal, Clock, HelpCircle, Box, Repeat, Play, Loader2, Factory,
  Layout, Edit2, Save, X, Palmtree, Truck
} from 'lucide-react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, ReferenceLine, Area, ComposedChart, Line, Bar, LabelList
} from 'recharts';
import dayjs from 'dayjs';
import { InventoryEngine } from './engine/InventoryEngine';
import { 
  InventoryInputs, 
  ForecastSegment, 
  InboundItem, 
  ReplenishmentAdvice, 
  TimelineData,
  OperationalAnalysis,
  SavedProfile,
  ProfileData
} from './types';
import { ReplenishmentTable } from './components/ReplenishmentTable';

const DEFAULT_INPUTS: InventoryInputs = {
  baseDate: dayjs().format('YYYY-MM-DD'),
  initialStock: 200,
  orderedNotShippedQty: 0,
  projectionDays: 120, 
  leadTimeSea: 45,
  leadTimeAir: 10,
  productionLeadTime: 10, 
  fluctuationBuffer: 10,
  maxStockDays: 45, 
  onHandQty: 0, 
  minOrderQty: 10,
  regularCycleDays: 30,
  allowSea: true,
  allowAir: true,
  // Supplier Holiday (Default 2026)
  enableHoliday: false,
  holidayStart: '2026-02-15',
  holidayEnd: '2026-03-04',
  // Freight Holiday (Default 2026)
  enableFreightHoliday: false,
  freightHolidayStart: '2026-02-15',
  freightHolidayEnd: '2026-02-25',
};

const DEFAULT_FORECASTS: ForecastSegment[] = [
  { id: 'f1', startDate: dayjs().format('YYYY-MM-DD'), endDate: dayjs().add(30, 'day').format('YYYY-MM-DD'), dailyVelocity: 15 },
  { id: 'f2', startDate: dayjs().add(31, 'day').format('YYYY-MM-DD'), endDate: dayjs().add(60, 'day').format('YYYY-MM-DD'), dailyVelocity: 10 },
];

const DEFAULT_INBOUNDS: InboundItem[] = [
  { id: 'i1', label: 'A', shipDate: dayjs().subtract(15, 'day').format('YYYY-MM-DD'), transitDays: 45, qty: 300, type: 'Sea' },
];

const createNewProfile = (name: string): SavedProfile => ({
  id: Date.now().toString() + Math.random().toString().slice(2, 6),
  name,
  lastModified: Date.now(),
  data: {
    inputs: { ...DEFAULT_INPUTS, baseDate: dayjs().format('YYYY-MM-DD') },
    forecasts: [...DEFAULT_FORECASTS],
    inbounds: [...DEFAULT_INBOUNDS],
    plans: []
  }
});

const InputWithTooltip = ({ label, icon: Icon, value, onChange, type="number", tooltip, className }: any) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const finalVal = type === 'number' ? Number(rawValue) : rawValue;
    onChange(finalVal);
  };

  return (
    <div className={`space-y-0.5 relative group ${className}`}>
      <label className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1 cursor-help tracking-tighter">
        {label} {Icon && <Icon className="w-2.5 h-2.5 text-slate-300" />}
      </label>
      <input 
        type={type} 
        value={type === 'number' ? Number(value).toString() : value} 
        onChange={handleChange} 
        className="w-full text-xs font-black p-1.5 bg-slate-50 border-none rounded-lg focus:ring-1 focus:ring-blue-200 outline-none transition-all" 
      />
      {tooltip && (
        <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block w-48 bg-slate-800 text-white text-[10px] p-2 rounded-lg shadow-xl z-50 pointer-events-none leading-tight">
          {tooltip}
        </div>
      )}
    </div>
  );
};

const ArrivalLabel = (props: any) => {
  const { x, y, width, index, data } = props;
  const item = data[index] as TimelineData;
  if (!item || item.arrivalQty <= 0) return null;

  const emoji = item.arrivingTypes.includes('Air') ? '✈️' : '🚢';
  const detailText = item.arrivingLabels.length > 0 ? item.arrivingLabels.join('/') : '';

  return (
    <g>
      <text x={x + width / 2} y={y - 20} fill="#4f46e5" textAnchor="middle" fontSize="9" fontWeight="800">
        {detailText}
      </text>
      <text x={x + width / 2} y={y - 5} textAnchor="middle" fontSize="11">
        {emoji}
      </text>
    </g>
  );
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as TimelineData;
    return (
      <div className="bg-white p-3 border border-slate-200 shadow-xl rounded-xl z-50 text-[10px]">
        <p className="font-black text-slate-800 mb-1.5 border-b pb-1 flex items-center gap-2">
           <Calendar className="w-3 h-3 text-slate-400" /> {data.date}
        </p>
        <div className="space-y-1">
          <p className="flex justify-between gap-4 text-slate-500"><span>日销量:</span> <span className="font-bold text-slate-700">{data.velocity}</span></p>
          <p className="flex justify-between gap-4 text-slate-500"><span>期末库存:</span> <span className={`font-bold ${data.simulated < 0 ? 'text-rose-600' : 'text-blue-600'}`}>{data.simulated}</span></p>
          <p className="flex justify-between gap-4 text-slate-500"><span>安全水位:</span> <span className="font-bold text-emerald-600">{data.healthyLevel}</span></p>
          {data.arrivalQty > 0 && (
             <div className="mt-2 pt-1 border-t border-dashed border-slate-100">
               <p className="font-black text-indigo-600 mb-0.5">到货明细:</p>
               {data.arrivingLabels.map((l, i) => (
                 <div key={i} className="flex items-center gap-1 text-[9px] text-slate-600">
                   <span>{data.arrivingTypes[i] === 'Air' ? '✈️' : '🚢'}</span>
                   <span>{l}</span>
                 </div>
               ))}
             </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

const App: React.FC = () => {
  // --- State Management for Profiles ---
  const [profiles, setProfiles] = useState<SavedProfile[]>(() => {
    try {
      const saved = localStorage.getItem('INVENTORY_PROFILES');
      return saved ? JSON.parse(saved) : [createNewProfile('默认方案')];
    } catch (e) {
      return [createNewProfile('默认方案')];
    }
  });

  const [activeProfileId, setActiveProfileId] = useState<string>(() => {
    return localStorage.getItem('INVENTORY_ACTIVE_ID') || profiles[0]?.id;
  });

  const [isRenaming, setIsRenaming] = useState(false);
  const [tempName, setTempName] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Ensure activeProfileId is valid
  useEffect(() => {
    if (!profiles.find(p => p.id === activeProfileId) && profiles.length > 0) {
      setActiveProfileId(profiles[0].id);
    }
  }, [profiles, activeProfileId]);

  // Persistence
  useEffect(() => {
    localStorage.setItem('INVENTORY_PROFILES', JSON.stringify(profiles));
    localStorage.setItem('INVENTORY_ACTIVE_ID', activeProfileId);
  }, [profiles, activeProfileId]);

  // Derived Active Data
  const activeProfile = profiles.find(p => p.id === activeProfileId) || profiles[0];
  const { inputs, forecasts, inbounds, plans } = activeProfile.data;

  // --- Calculation State ---
  const [adviceList, setAdviceList] = useState<ReplenishmentAdvice[]>([]);
  const [chartData, setChartData] = useState<TimelineData[]>([]);
  const [analysis, setAnalysis] = useState<OperationalAnalysis[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);

  const handleCalculate = useCallback(async () => {
    if (!activeProfile) return;
    setIsCalculating(true);
    // Simulate async calculation for UX
    await new Promise(resolve => setTimeout(resolve, 300));
    const engine = new InventoryEngine(inputs, forecasts, inbounds, plans);
    const optimizedAdvice = engine.calculateAdvice();
    const timeline = engine.generateTimeline(optimizedAdvice);
    setAdviceList(optimizedAdvice);
    setChartData(timeline);
    setAnalysis(engine.runAnalysis(timeline));
    setIsCalculating(false);
  }, [inputs, forecasts, inbounds, plans, activeProfile]);

  // Trigger calculation on mount or profile switch
  useEffect(() => {
    handleCalculate();
  }, [activeProfileId]); 

  // --- Profile Helpers ---
  const updateActiveProfileData = (updater: (data: ProfileData) => ProfileData) => {
    setProfiles(prev => prev.map(p => {
      if (p.id === activeProfileId) {
        return { ...p, data: updater(p.data), lastModified: Date.now() };
      }
      return p;
    }));
  };

  const handleAddProfile = () => {
    const newProfile = createNewProfile(`方案 ${profiles.length + 1}`);
    setProfiles([...profiles, newProfile]);
    setActiveProfileId(newProfile.id);
  };

  const handleDeleteProfile = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (profiles.length <= 1) return; // Prevent deleting last profile
    if (window.confirm('确定要删除此方案吗？')) {
      const newProfiles = profiles.filter(p => p.id !== id);
      setProfiles(newProfiles);
      if (id === activeProfileId) {
        setActiveProfileId(newProfiles[0].id);
      }
    }
  };

  const startRenaming = () => {
    setTempName(activeProfile.name);
    setIsRenaming(true);
    setTimeout(() => nameInputRef.current?.focus(), 100);
  };

  const saveRename = () => {
    if (tempName.trim()) {
      setProfiles(prev => prev.map(p => p.id === activeProfileId ? { ...p, name: tempName.trim() } : p));
    }
    setIsRenaming(false);
  };

  // --- Data Updaters ---
  const updateInbound = (type: 'inbound' | 'plan', id: string, field: keyof InboundItem, value: any) => {
    updateActiveProfileData(data => {
      const list = type === 'inbound' ? data.inbounds : data.plans;
      const newList = list.map(item => {
        if (item.id === id) {
          const newItem = { ...item, [field]: value };
          if (field === 'type') {
            newItem.transitDays = value === 'Air' ? data.inputs.leadTimeAir : data.inputs.leadTimeSea;
          }
          return newItem;
        }
        return item;
      });
      return { ...data, [type === 'inbound' ? 'inbounds' : 'plans']: newList };
    });
  };

  const updateForecast = (id: string, field: keyof ForecastSegment, value: any) => {
    updateActiveProfileData(data => ({
      ...data,
      forecasts: data.forecasts.map(f => f.id === id ? { ...f, [field]: value } : f)
    }));
  };

  const addSmartForecast = () => {
    updateActiveProfileData(data => {
      const last = data.forecasts[data.forecasts.length - 1];
      let newStart = dayjs().format('YYYY-MM-DD');
      let newEnd = dayjs().add(30, 'day').format('YYYY-MM-DD');
      let newVel = 10;
      if (last) {
        newStart = dayjs(last.endDate).add(1, 'day').format('YYYY-MM-DD');
        newEnd = dayjs(newStart).add(30, 'day').format('YYYY-MM-DD');
        newVel = last.dailyVelocity;
      }
      return {
        ...data,
        forecasts: [...data.forecasts, { id: Date.now().toString(), startDate: newStart, endDate: newEnd, dailyVelocity: newVel }]
      };
    });
  };

  const addSmartInboundItem = (type: 'inbound' | 'plan') => {
    updateActiveProfileData(data => {
      const list = type === 'inbound' ? data.inbounds : data.plans;
      const letter = String.fromCharCode(65 + (list.length % 26));
      const label = `${letter}`;
      let newDate = data.inputs.baseDate;
      if (list.length > 0) {
        newDate = dayjs(list[list.length - 1].shipDate).add(data.inputs.regularCycleDays, 'day').format('YYYY-MM-DD');
      }
      const newItem: InboundItem = { 
        id: Date.now().toString(), 
        label, 
        shipDate: newDate, 
        transitDays: data.inputs.leadTimeSea, 
        qty: 100, 
        type: 'Sea' 
      };
      return { ...data, [type === 'inbound' ? 'inbounds' : 'plans']: [...list, newItem] };
    });
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans flex flex-col">
      {/* Top Tab Bar */}
      <div className="bg-slate-900 text-slate-300 flex items-center px-4 overflow-x-auto border-b border-slate-800 h-10 gap-1 select-none sticky top-0 z-[60]">
        <div className="flex items-center gap-2 mr-4 text-xs font-black tracking-widest text-slate-500 uppercase">
          <Layout className="w-3.5 h-3.5" /> Profiles
        </div>
        {profiles.map(profile => {
          const isActive = profile.id === activeProfileId;
          return (
            <div 
              key={profile.id}
              onClick={() => setActiveProfileId(profile.id)}
              className={`
                group relative flex items-center gap-2 px-4 h-full text-[11px] font-bold cursor-pointer transition-all border-b-2
                ${isActive 
                  ? 'bg-slate-800 text-white border-blue-500' 
                  : 'border-transparent hover:bg-slate-800 hover:text-slate-100'}
              `}
            >
              <span>{profile.name}</span>
              {!isActive && (
                <button 
                  onClick={(e) => handleDeleteProfile(e, profile.id)}
                  className="p-1 rounded-full hover:bg-rose-900/50 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
        <button 
          onClick={handleAddProfile}
          className="ml-2 p-1.5 rounded-md hover:bg-slate-800 text-slate-500 hover:text-emerald-400 transition-colors"
          title="新建方案"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3 flex-1">
        {/* Main Header */}
        <header className="flex justify-between items-center mb-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-200"><Package className="w-5 h-5 text-white" /></div>
            <div>
              <div className="flex items-center gap-2">
                 {isRenaming ? (
                   <div className="flex items-center gap-1">
                     <input 
                        ref={nameInputRef}
                        value={tempName}
                        onChange={e => setTempName(e.target.value)}
                        onBlur={saveRename}
                        onKeyDown={e => e.key === 'Enter' && saveRename()}
                        className="text-sm font-black text-slate-800 bg-slate-100 px-2 py-0.5 rounded outline-none border border-blue-300 w-32"
                     />
                     <button onClick={saveRename}><Save className="w-3.5 h-3.5 text-emerald-500"/></button>
                   </div>
                 ) : (
                   <h1 
                     className="text-sm font-black text-slate-800 flex items-center gap-2 cursor-pointer hover:text-blue-600 transition-colors group"
                     onClick={startRenaming}
                     title="点击重命名"
                   >
                     {activeProfile.name}
                     <Edit2 className="w-3 h-3 text-slate-300 group-hover:text-blue-400" />
                   </h1>
                 )}
                 <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-xs">v9.9 Pro</span>
              </div>
              <p className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter mt-0.5">Intelligent Inventory Control Hub</p>
            </div>
          </div>
          <button onClick={handleCalculate} disabled={isCalculating} className="flex items-center gap-1.5 bg-slate-900 text-white px-4 py-1.5 rounded-lg text-xs font-bold shadow-md hover:bg-slate-800 active:scale-95 transition-all">
            {isCalculating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 fill-current" />}
            执行推演
          </button>
        </header>

        <div className="grid grid-cols-12 gap-3 max-w-[1600px] mx-auto">
          <aside className="col-span-12 lg:col-span-3 space-y-3">
            <section className="bg-white p-3 rounded-2xl border border-slate-200 space-y-3 shadow-sm">
              <h3 className="text-[10px] font-black flex items-center gap-1.5 text-slate-800 uppercase tracking-widest"><Settings className="w-3 h-3 text-blue-500" /> 全局设置</h3>
              <div className="grid grid-cols-2 gap-2">
                <InputWithTooltip label="起始日" type="date" value={inputs.baseDate} onChange={(v:string)=>updateActiveProfileData(d=>({...d, inputs:{...d.inputs, baseDate:v}}))} />
                <InputWithTooltip label="亚马逊可售库存" value={inputs.initialStock} onChange={(v:number)=>updateActiveProfileData(d=>({...d, inputs:{...d.inputs, initialStock:v}}))} />
                <InputWithTooltip label="已下单未发" value={inputs.orderedNotShippedQty} onChange={(v:number)=>updateActiveProfileData(d=>({...d, inputs:{...d.inputs, orderedNotShippedQty:v}}))} tooltip="工厂已接单但尚未发货的库存，将在建议补货前优先扣减"/>
                <InputWithTooltip label="推演天数" value={inputs.projectionDays} onChange={(v:number)=>updateActiveProfileData(d=>({...d, inputs:{...d.inputs, projectionDays:v}}))} />
              </div>
              <div className="grid grid-cols-2 gap-2 border-t pt-2">
                <InputWithTooltip label="做货周期" icon={Factory} value={inputs.productionLeadTime} onChange={(v:number)=>updateActiveProfileData(d=>({...d, inputs:{...d.inputs, productionLeadTime:v}}))} tooltip="从下单到可以出货的天数" />
                <InputWithTooltip label="海运时效" icon={Ship} value={inputs.leadTimeSea} onChange={(v:number)=>updateActiveProfileData(d=>({...d, inputs:{...d.inputs, leadTimeSea:v}}))} />
                <InputWithTooltip label="空运时效" icon={Plane} value={inputs.leadTimeAir} onChange={(v:number)=>updateActiveProfileData(d=>({...d, inputs:{...d.inputs, leadTimeAir:v}}))} />
                <InputWithTooltip label="安全库存天数" value={inputs.fluctuationBuffer} onChange={(v:number)=>updateActiveProfileData(d=>({...d, inputs:{...d.inputs, fluctuationBuffer:v}}))} tooltip="安全库存缓冲天数" />
                <InputWithTooltip label="在库可售天数上限" value={inputs.maxStockDays} onChange={(v:number)=>updateActiveProfileData(d=>({...d, inputs:{...d.inputs, maxStockDays:v}}))} tooltip="控制补货总量" />
                <InputWithTooltip label="工厂现货" value={inputs.onHandQty} onChange={(v:number)=>updateActiveProfileData(d=>({...d, inputs:{...d.inputs, onHandQty:v}}))} tooltip="工厂现有的可直接发货的数量" />
                <InputWithTooltip label="最小发货数量（一箱多少个）" value={inputs.minOrderQty} className="col-span-2" onChange={(v:number)=>updateActiveProfileData(d=>({...d, inputs:{...d.inputs, minOrderQty:v}}))} />
              </div>
              <div className="flex gap-2 pt-1">
                <label className="flex-1 flex items-center justify-between p-2 rounded-lg bg-slate-50 border text-[9px] font-bold cursor-pointer transition-colors hover:bg-white">
                  <span>🚢 海运</span><input type="checkbox" checked={inputs.allowSea} onChange={e=>updateActiveProfileData(d=>({...d, inputs:{...d.inputs, allowSea:e.target.checked}}))} className="w-3 h-3" />
                </label>
                <label className="flex-1 flex items-center justify-between p-2 rounded-lg bg-slate-50 border text-[9px] font-bold cursor-pointer transition-colors hover:bg-white">
                  <span>✈️ 空运</span><input type="checkbox" checked={inputs.allowAir} onChange={e=>updateActiveProfileData(d=>({...d, inputs:{...d.inputs, allowAir:e.target.checked}}))} className="w-3 h-3" />
                </label>
              </div>

              {/* Holiday Settings */}
              <div className="border-t pt-2 space-y-2">
                 {/* Supplier Holiday */}
                 <div className="space-y-1">
                   <div className="flex justify-between items-center">
                      <label className="text-[10px] font-black uppercase text-amber-600 flex items-center gap-1">
                        <Palmtree className="w-3 h-3" /> 供应商假期
                      </label>
                      <input type="checkbox" checked={inputs.enableHoliday} onChange={e=>updateActiveProfileData(d=>({...d, inputs:{...d.inputs, enableHoliday:e.target.checked}}))} className="w-3 h-3 accent-amber-500" />
                   </div>
                   {inputs.enableHoliday && (
                     <div className="grid grid-cols-2 gap-2 bg-amber-50/50 p-2 rounded-lg border border-amber-100">
                        <div className="space-y-0.5">
                          <label className="text-[8px] font-black text-amber-500 uppercase">放假</label>
                          <input type="date" value={inputs.holidayStart} onChange={e=>updateActiveProfileData(d=>({...d, inputs:{...d.inputs, holidayStart:e.target.value}}))} className="w-full text-[9px] p-1 border rounded" />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[8px] font-black text-amber-500 uppercase">复工</label>
                          <input type="date" value={inputs.holidayEnd} onChange={e=>updateActiveProfileData(d=>({...d, inputs:{...d.inputs, holidayEnd:e.target.value}}))} className="w-full text-[9px] p-1 border rounded" />
                        </div>
                     </div>
                   )}
                 </div>

                 {/* Freight Forwarder Holiday */}
                 <div className="space-y-1 border-t border-slate-100 pt-2">
                   <div className="flex justify-between items-center">
                      <label className="text-[10px] font-black uppercase text-indigo-600 flex items-center gap-1">
                        <Truck className="w-3 h-3" /> 货代假期
                      </label>
                      <input type="checkbox" checked={inputs.enableFreightHoliday} onChange={e=>updateActiveProfileData(d=>({...d, inputs:{...d.inputs, enableFreightHoliday:e.target.checked}}))} className="w-3 h-3 accent-indigo-500" />
                   </div>
                   {inputs.enableFreightHoliday && (
                     <div className="grid grid-cols-2 gap-2 bg-indigo-50/50 p-2 rounded-lg border border-indigo-100">
                        <div className="space-y-0.5">
                          <label className="text-[8px] font-black text-indigo-500 uppercase">放假</label>
                          <input type="date" value={inputs.freightHolidayStart} onChange={e=>updateActiveProfileData(d=>({...d, inputs:{...d.inputs, freightHolidayStart:e.target.value}}))} className="w-full text-[9px] p-1 border rounded" />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[8px] font-black text-indigo-500 uppercase">复工</label>
                          <input type="date" value={inputs.freightHolidayEnd} onChange={e=>updateActiveProfileData(d=>({...d, inputs:{...d.inputs, freightHolidayEnd:e.target.value}}))} className="w-full text-[9px] p-1 border rounded" />
                        </div>
                     </div>
                   )}
                 </div>
              </div>
            </section>

            <section className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1 text-emerald-600"><TrendingUp className="w-3 h-3" /> 销量预测</h3>
                <button onClick={addSmartForecast} className="p-1 hover:bg-emerald-50 rounded-md transition-colors"><Plus className="w-3 h-3 text-emerald-600" /></button>
              </div>
              <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                {forecasts.map(f => (
                  <div key={f.id} className="p-2 bg-slate-50 rounded-lg border relative group">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="flex-1 flex items-center gap-1">
                        <span className="text-[8px] font-black text-slate-400 uppercase">始:</span>
                        <input type="date" value={f.startDate} onChange={e=>updateForecast(f.id,'startDate',e.target.value)} className="w-full text-[9px] p-1 bg-white border rounded outline-none focus:ring-1 focus:ring-emerald-200" />
                      </div>
                      <div className="flex-1 flex items-center gap-1">
                        <span className="text-[8px] font-black text-slate-400 uppercase">终:</span>
                        <input type="date" value={f.endDate} onChange={e=>updateForecast(f.id,'endDate',e.target.value)} className="w-full text-[9px] p-1 bg-white border rounded outline-none focus:ring-1 focus:ring-emerald-200" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black text-slate-500 uppercase flex-shrink-0">日销量预测:</span>
                      <input type="number" value={Number(f.dailyVelocity).toString()} onChange={e=>updateForecast(f.id,'dailyVelocity',Number(e.target.value))} className="flex-1 text-xs font-black p-1 bg-white border rounded text-center outline-none focus:ring-1 focus:ring-emerald-200" />
                    </div>
                    <button
                      type="button"
                      className="absolute top-1.5 right-1.5 relative z-50 p-1 bg-white hover:bg-rose-50 rounded-md transition-opacity opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (window.confirm('确定要删除这条预测吗？')) {
                          updateActiveProfileData(d => ({...d, forecasts: d.forecasts.filter(it => it.id !== f.id)}));
                        }
                      }}
                    >
                      <Trash2 className="w-3 h-3 text-rose-300" />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
               <h3 className="text-[10px] font-black flex items-center gap-1 uppercase tracking-widest mb-2 text-indigo-600"><BarChart3 className="w-3 h-3" /> 货件计划</h3>
               <div className="space-y-3">
                  {['inbound', 'plan'].map(t => (
                    <div key={t}>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">{t==='inbound'?'已发货货件':'待发货计划'}</span>
                        <button onClick={() => addSmartInboundItem(t as any)} className="p-0.5 hover:bg-indigo-50 rounded transition-colors"><Plus className="w-3 h-3 text-indigo-500" /></button>
                      </div>
                      <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                        {(t==='inbound'?inbounds:plans).map(i => (
                          <div key={i.id} className="p-2 bg-slate-50 rounded-lg border relative group text-[10px]">
                             <div className="flex items-center gap-2 mb-1.5">
                               <input value={i.label} onChange={e=>updateInbound(t as any,i.id,'label',e.target.value)} className="w-8 px-1 py-0.5 bg-indigo-600 text-white text-[9px] font-black rounded text-center outline-none" title="编号" />
                               <input type="date" value={i.shipDate} onChange={e=>updateInbound(t as any,i.id,'shipDate',e.target.value)} className="flex-1 bg-white border p-1 rounded text-[10px] outline-none" />
                             </div>
                             <div className="flex gap-2">
                               <div className="flex-1 flex items-center bg-white border rounded px-1.5 py-1 gap-1">
                                 <span className="text-[9px] text-slate-400 font-bold uppercase">数量</span>
                                 <input type="number" value={Number(i.qty).toString()} onChange={e=>updateInbound(t as any,i.id,'qty',Number(e.target.value))} className="w-full text-center font-black border-none p-0 outline-none" />
                               </div>
                               <div className="flex items-center bg-white border rounded px-1.5 py-1 gap-1">
                                 <Clock className="w-2.5 h-2.5 text-slate-300" />
                                 <input type="number" value={Number(i.transitDays).toString()} onChange={e=>updateInbound(t as any,i.id,'transitDays',Number(e.target.value))} className="w-8 text-center font-bold border-none p-0 outline-none" />
                               </div>
                               <select value={i.type || 'Sea'} onChange={e=>updateInbound(t as any,i.id,'type',e.target.value as any)} className="bg-white border rounded p-1 text-[10px] outline-none">
                                 <option value="Sea">🚢</option>
                                 <option value="Air">✈️</option>
                               </select>
                             </div>
                             <button
                               type="button"
                               className="absolute top-1 right-1 relative z-50 p-1 bg-white hover:bg-rose-50 rounded-md transition-opacity opacity-0 group-hover:opacity-100"
                               onClick={(e) => {
                                 e.preventDefault();
                                 e.stopPropagation();
                                 if (window.confirm('确定要删除此货件计划吗？')) {
                                   updateActiveProfileData(d => {
                                      const setterKey = t === 'inbound' ? 'inbounds' : 'plans';
                                      return { ...d, [setterKey]: d[setterKey].filter(it => it.id !== i.id) };
                                   });
                                 }
                               }}
                             >
                               <Trash2 className="w-3 h-3 text-rose-300" />
                             </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
               </div>
            </section>
          </aside>

          <div className="col-span-12 lg:col-span-9 space-y-3">
            <section className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm relative">
              {isCalculating && (
                <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] z-10 flex items-center justify-center rounded-2xl">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-900" />
                </div>
              )}
              
              <div className="flex flex-wrap justify-between items-center mb-3">
                <div>
                  <h2 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">库存动态仿真推演</h2>
                  <div className="flex gap-3 text-[8px] font-bold text-slate-400 uppercase mt-1">
                     <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-600"></div>在库库存</div>
                     <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div>安全水位线</div>
                     <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-indigo-400"></div>到货节点 (🚢/✈️)</div>
                  </div>
                </div>

                {analysis.length > 0 && (
                  <div className="flex gap-2">
                    {analysis.map((a, i) => (
                      <div key={i} className={`px-2 py-1 rounded-md border flex items-center gap-1.5 text-[9px] font-black ${
                        a.type === 'stockout' ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-amber-50 border-amber-100 text-amber-700'
                      }`}>
                        {a.type === 'stockout' ? <AlertCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                        {a.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 25, right: 0, left: -25, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorStk" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{fontSize: 8, fill: '#94a3b8'}} axisLine={false} tickLine={false} minTickGap={30} />
                    <YAxis tick={{fontSize: 8, fill: '#94a3b8'}} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine y={0} stroke="#ef4444" />
                    <Bar name="到货" dataKey="arrivalQty" barSize={12} fill="#818cf8" radius={[2, 2, 0, 0]}>
                      <LabelList dataKey="arrivalQty" content={<ArrivalLabel data={chartData} />} />
                    </Bar>
                    <Bar name="断货缺口" dataKey="shortageQty" barSize={12} fill="#fb7185" radius={[2, 2, 0, 0]} />
                    <Area name="在库" type="monotone" dataKey="simulated" stroke="#2563eb" fill="url(#colorStk)" strokeWidth={2} />
                    <Line name="安全线" type="stepAfter" dataKey="healthyLevel" stroke="#10b981" strokeWidth={1} strokeDasharray="4 4" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>

            <ReplenishmentTable adviceList={adviceList} baseDate={inputs.baseDate} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;

 