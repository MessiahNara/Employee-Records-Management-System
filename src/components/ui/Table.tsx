import { ReactNode } from 'react';
import './Table.css';

export interface Column<T> {
  key: string;
  header: string | ReactNode;
  render?: (item: T) => ReactNode;
  width?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string | number;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  loading?: boolean;
}

function Table<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyMessage = 'No data available',
  loading = false,
}: TableProps<T>) {
  const getMobileLabel = (column: Column<T>) => {
    if (typeof column.header === 'string') {
      return column.header;
    }

    return column.key;
  };

  if (loading) {
    return (
      <div className="table-container">
        <div className="table__loading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', padding: '2.5rem', color: 'var(--text-secondary)' }}>
          <div className="dashboard__spinner" style={{ width: '22px', height: '22px', borderWidth: '2.5px', margin: 0 }}></div>
          <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Loading records...</span>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="table-container">
        <div className="table__empty">{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table className="table">
        <thead className="table__head">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className="table__header"
                style={{ width: column.width }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="table__body">
          {data.map((item) => (
            <tr
              key={keyExtractor(item)}
              className={`table__row ${onRowClick ? 'table__row--clickable' : ''}`}
              onClick={() => onRowClick?.(item)}
              role={onRowClick ? 'button' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
            >
              {columns.map((column) => {
                const cellContent = column.render
                  ? column.render(item)
                  : String((item as any)[column.key] ?? '');
                const titleAttr = (typeof cellContent === 'string' || typeof cellContent === 'number') && String(cellContent).trim() ? String(cellContent) : undefined;
                return (
                  <td
                    key={column.key}
                    className="table__cell"
                    data-label={getMobileLabel(column)}
                    title={titleAttr}
                  >
                    {cellContent}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Table;
