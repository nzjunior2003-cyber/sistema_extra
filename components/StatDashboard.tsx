import { getEffectiveCostItems } from "../utils/costHelpers";
import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, ComposedChart } from 'recharts';

export const StatDashboard = ({ title = "Estatísticas", escalas, currentUserMatricula }: { title?: string, escalas: any[], currentUserMatricula?: string }) => {
  const data = useMemo(() => {
    const monthlyData: Record<string, { horas: number, valor: number }> = {
      '01': { horas: 0, valor: 0 }, '02': { horas: 0, valor: 0 }, '03': { horas: 0, valor: 0 }, '04': { horas: 0, valor: 0 }, 
      '05': { horas: 0, valor: 0 }, '06': { horas: 0, valor: 0 }, '07': { horas: 0, valor: 0 }, '08': { horas: 0, valor: 0 }, 
      '09': { horas: 0, valor: 0 }, '10': { horas: 0, valor: 0 }, '11': { horas: 0, valor: 0 }, '12': { horas: 0, valor: 0 },
    };

    let totalHoras = 0;
    let totalValor = 0;

    escalas.forEach(escala => {
      const month = escala.formData.eventDate ? escala.formData.eventDate.split('-')[1] : null;
      if (!month) return;

      getEffectiveCostItems(escala.formData)?.forEach((item: any) => {
        // Se currentUserMatricula for passado, filtra apenas os itens daquele militar.
        if (currentUserMatricula && item.soldierMatricula !== currentUserMatricula) {
            return;
        }

        const h = (Number(item.quantity) || 0);
        const v = (Number(item.quantity) || 0) * (Number(item.unitValue) || 0);

        monthlyData[month].horas += h;
        monthlyData[month].valor += v;
        totalHoras += h;
        totalValor += v;
      });
    });

    const monthNames = {
      '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr', '05': 'Mai', '06': 'Jun',
      '07': 'Jul', '08': 'Ago', '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez'
    };

    return {
      totalHoras,
      totalValor,
      chartData: Object.entries(monthlyData).map(([month, stats]) => ({
        name: monthNames[month as keyof typeof monthNames],
        Horas: stats.horas,
        Valor: stats.valor
      }))
    };
  }, [escalas, currentUserMatricula]);

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
      <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-100">{title}</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
            <div className="text-sm text-blue-600 dark:text-blue-400 font-bold uppercase">Total de Horas</div>
            <div className="text-2xl font-black text-blue-800 dark:text-blue-300">{data.totalHoras}h</div>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-100 dark:border-green-800">
            <div className="text-sm text-green-600 dark:text-green-400 font-bold uppercase">Volume Financeiro</div>
            <div className="text-2xl font-black text-green-800 dark:text-green-300">
                {data.totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </div>
        </div>
      </div>

      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
            <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
            <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} tickFormatter={(val) => `R$${val}`} />
            <Tooltip 
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', backgroundColor: '#fff', color: '#111827' }}
              cursor={{ fill: '#f3f4f6' }}
              formatter={(value: any, name: string) => {
                  if (name === 'Valor') return [Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 'Volume Financeiro'];
                  return [`${value}h`, 'Horas Extraordinárias'];
              }}
            />
            <Bar yAxisId="left" dataKey="Horas" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Horas" />
            <Line yAxisId="right" type="monotone" dataKey="Valor" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Valor" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
