import { ReactNode } from 'react';
import './Badge.css';

interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'violet' | 'primary';
  size?: 'sm' | 'md';
  className?: string;
  style?: React.CSSProperties;
}

function Badge({ children, variant = 'default', size = 'md', className = '', style }: BadgeProps) {
  const classes = [
    'badge',
    `badge--${variant}`,
    `badge--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <span className={classes} style={style}>{children}</span>;
}

export default Badge;
