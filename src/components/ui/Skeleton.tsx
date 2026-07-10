import './Skeleton.css';

interface SkeletonProps {
  width?: string;
  height?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  className?: string;
}

function Skeleton({ width, height, variant = 'text', className = '' }: SkeletonProps) {
  const style = {
    width: width || (variant === 'text' ? '100%' : undefined),
    height: height || (variant === 'text' ? '1em' : '100px'),
  };

  const classes = [
    'skeleton',
    `skeleton--${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <div className={classes} style={style} aria-busy="true" aria-live="polite" />;
}

export default Skeleton;
