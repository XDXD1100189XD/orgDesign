'use client';

import type { TableBlock } from '@/lib/story/types';

export function TableBlockRenderer({ block, maxRows }: {
  block: TableBlock;
  maxRows?: number;
}) {
  const limit = maxRows ?? block.maxDisplayRows ?? 10;
  const visibleRows = block.rows.slice(0, limit);
  const truncated = block.rows.length > limit;

  if (!block.columns.length || !block.rows.length) {
    return (
      <div style={{ color: '#999', fontSize: 12, padding: '8px 0' }}>No data</div>
    );
  }

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 11,
        fontFamily: 'inherit',
      }}>
        <thead>
          <tr>
            {block.columns.map(col => (
              <th key={col} style={{
                textAlign: 'left',
                padding: '4px 8px',
                borderBottom: '1.5px solid var(--teal, #006b6b)',
                color: 'var(--teal, #006b6b)',
                fontWeight: 600,
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
              }}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(0,107,107,0.03)' }}>
              {block.columns.map(col => (
                <td key={col} style={{
                  padding: '4px 8px',
                  borderBottom: '1px solid rgba(0,0,0,0.06)',
                  fontSize: 11,
                  color: 'var(--ink, #1a1d20)',
                  whiteSpace: 'nowrap',
                  maxWidth: 160,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {String(row[col] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {truncated && (
        <div style={{ fontSize: 10, color: '#999', padding: '4px 8px', fontStyle: 'italic' }}>
          Showing {limit} of {block.rows.length} rows
        </div>
      )}
    </div>
  );
}
