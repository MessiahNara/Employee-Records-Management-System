import Skeleton from './Skeleton';
import Card from './Card';
import './KPICard.css';

function KPICardSkeleton() {
  return (
    <Card>
      <div className="kpi-card">
        <Skeleton variant="circular" width="48px" height="48px" />
        <div className="kpi-card__content">
          <Skeleton variant="text" width="120px" height="14px" />
          <Skeleton variant="text" width="80px" height="28px" />
        </div>
      </div>
    </Card>
  );
}

export default KPICardSkeleton;
