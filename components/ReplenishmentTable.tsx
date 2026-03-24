
import React from 'react';
import { Plane, Ship, HelpCircle, Calendar, ArrowRight, AlertOctagon, Clock, Factory, Palmtree } from 'lucide-react';
import { ReplenishmentAdvice } from '../types';
import dayjs from 'dayjs';

interface Props {
  adviceList: ReplenishmentAdvice[];
  baseDate: string;
}

export const ReplenishmentTable: React.FC<Props> = ({ adviceList, baseDate }) => {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
        <div>
          <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
            🚀 补货与采购决策建议
          </h3>
          <p className="text-[9px] text-slate-400 mt-0.5">综合做货周期与运输时效的准时化建议</p>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-white text-[9px] text-slate-400 uppercase tracking-widest font-black border-b border-slate-100">
            <tr>
              <th className="px-4 py-3">编号</th>
              <th className="px-4 py-3">建议下单日</th>
              <th className="px-4 py-3">发货 → 入库</th>
              <th className="px-4 py-3">数量</th>
              <th className="px-4 py-3 hidden md:table-cell">备注</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {adviceList.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-12 text-center text-slate-400 text-xs italic font-bold">
                  库存覆盖良好，无需额外采购操作。
                </td>
              </tr>
            ) : (
              adviceList.map((item) => {
                const isLate = item.suggestedOrderDate && dayjs(item.suggestedOrderDate).isBefore(dayjs(baseDate), 'day');
                
                return (
                  <tr key={item.id} className={`hover:bg-slate-50 transition-all group ${item.type === 'SalesControl' ? 'bg-rose-50/20' : ''}`}>
                    <td className="px-4 py-3">
                      {item.type === 'SalesControl' ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-black bg-rose-600 text-white shadow-sm ring-1 ring-rose-300">
                          <AlertOctagon className="w-3 h-3" /> 限流
                        </span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                             <span className="w-6 h-6 flex items-center justify-center rounded-lg bg-indigo-600 text-white font-black text-[10px] shadow-sm">
                               {item.batchId}
                             </span>
                             <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black ring-1 ring-inset ${
                                item.type === 'Air' ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-indigo-50 text-indigo-700 ring-indigo-200'
                              }`}>
                                {item.type === 'Air' ? <Plane className="w-3 h-3" /> : <Ship className="w-3 h-3" />}
                                {item.type === 'Air' ? '建议空运' : '建议海运'}
                              </span>
                          </div>
                          {item.isPreOrder && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold bg-amber-100 text-amber-700 w-fit">
                              <Palmtree className="w-2.5 h-2.5" /> 提前采购
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {item.type === 'SalesControl' ? (
                        <div className="flex items-center gap-1 text-[11px] font-black text-rose-700 uppercase">
                           限控期: {item.dateRange?.start.slice(5)} <ArrowRight className="w-2.5 h-2.5 opacity-30"/> {item.dateRange?.end.slice(5)}
                        </div>
                      ) : (
                        isLate ? (
                          <div className="flex items-center gap-1.5 text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-1 rounded-md border border-rose-100 animate-pulse leading-tight">
                            请立即下单，在推荐发货日之前发货
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-[11px] font-black text-orange-600">
                             <Factory className="w-3 h-3" /> {item.suggestedOrderDate?.slice(5)}
                          </div>
                        )
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {item.type !== 'SalesControl' && (
                        <div className="flex items-center gap-2 text-[11px] font-black text-slate-700">
                          <Calendar className="w-2.5 h-2.5 text-blue-500" /> {item.suggestedShipDate?.slice(5)}
                          <ArrowRight className="w-3 h-3 text-slate-200" />
                          <span className="opacity-60">{item.arrivalDate?.slice(5)}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {item.type !== 'SalesControl' ? (
                        <div className="flex flex-col">
                          <div className="flex items-baseline gap-1">
                            <span className="text-sm font-black text-slate-900">{item.qty?.toLocaleString()}</span>
                            <span className="text-[8px] font-bold text-slate-400 uppercase">PCS</span>
                          </div>
                          {item.deductionInfo && (
                             <div className="text-[8px] text-slate-400 flex items-center gap-1 mt-0.5 bg-slate-100 px-1 py-0.5 rounded w-fit">
                               <span>库存抵扣:</span>
                               <span className="font-bold text-slate-500">{item.deductionInfo.pre}</span>
                               <span>-</span>
                               <span className="font-bold text-slate-800">{item.deductionInfo.used}</span>
                               <span>=</span>
                               <span className="font-bold text-slate-500">{item.deductionInfo.remaining}</span>
                             </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] font-black text-rose-600 italic">每日上限 {item.targetVelocity} 单</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[10px] text-slate-500 font-medium hidden md:table-cell max-w-[200px]">
                      {item.reason}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
