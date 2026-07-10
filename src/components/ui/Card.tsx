import { ReactNode, HTMLAttributes } from 'react';
import './Card.css';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

function Card({ children, className = '', onClick, hoverable = false, ...props }: CardProps) {
  const classes = [
    'card',
    hoverable && 'card--hoverable',
    onClick && 'card--clickable',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Don't handle keyboard events if the target is an input, textarea, or button
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.tagName === 'SELECT'
    ) {
      return;
    }

    // Also check if we're inside a modal
    if (target.closest('.modal')) {
      return;
    }

    // Also check if we're inside a form
    if (target.closest('form')) {
      return;
    }

    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div 
      className={classes} 
      onClick={onClick} 
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : props.role} 
      tabIndex={onClick ? 0 : undefined}
      {...props}
    >
      {children}
    </div>
  );
}

export default Card;
