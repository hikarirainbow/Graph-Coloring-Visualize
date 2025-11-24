import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const LiveMetrics = ({ data = [] }) => {
    return (
        <div className="h-40 w-full bg-slate-900 rounded border border-slate-700 p-2">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                    <XAxis dataKey="iter" hide />
                    <YAxis hide domain={[0, 'auto']} />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '4px', fontSize: '12px' }}
                        itemStyle={{ color: '#e2e8f0' }}
                    />
                    <Line type="monotone" dataKey="conflicts" stroke="#3b82f6" strokeWidth={2} dot={false} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

export default LiveMetrics;
