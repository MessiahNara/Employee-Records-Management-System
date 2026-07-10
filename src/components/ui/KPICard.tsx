import { ReactNode } from 'react';
import Card from './Card';
import './KPICard.css';

interface KPICardProps {
  icon: ReactNode;
  label: string;
  value: number | string;
  trend?: {
    direction: 'up' | 'down' | 'neutral';
    percentage: number;
  };
}

function KPICard({ icon, label, value, trend }: KPICardProps) {
  // Create descriptive ARIA label combining label and value
  const ariaLabel = `${label}: ${value}${trend ? `, trend ${trend.direction} by ${trend.percentage} percent` : ''}`;
  
  return (
    <Card 
      className="kpi-card"
      role="region"
      aria-label={ariaLabel}
    >
      <div className="kpi-card__icon" aria-hidden="true">{icon}</div>
      <div className="kpi-card__content">
        <div className="kpi-card__label">{label}</div>
        <div className="kpi-card__value">{value}</div>
        {trend && (
          <div className={`kpi-card__trend kpi-card__trend--${trend.direction}`}>
            <span className="kpi-card__trend-icon" aria-hidden="true">
              {trend.direction === 'up' && '↑'}
              {trend.direction === 'down' && '↓'}
              {trend.direction === 'neutral' && '→'}
            </span>
            <span className="kpi-card__trend-value">{trend.percentage}%</span>
          </div>
        )}
      </div>
    </Card>
  );
}

export default KPICard;
