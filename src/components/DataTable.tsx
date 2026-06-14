import { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface Column {
  key: string;
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render?: (row: any) => React.ReactNode;
  sortable?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface DataTableProps {
  columns: Column[];
  data: any[];
  keyField?: string;
  filters?: React.ReactNode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actions?: (row: any) => React.ReactNode;
  selectable?: boolean;
  selectedIds?: number[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSelectionChange?: (ids: number[], rows: any[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  isRowSelectable?: (row: any) => boolean;
}

export default function DataTable({
  columns,
  data,
  keyField = 'id',
  filters,
  actions,
  selectable = false,
  selectedIds = [],
  onSelectionChange,
  isRowSelectable,
}: DataTableProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedData = [...data].sort((a, b) => {
    if (!sortKey) return 0;
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (aVal == null || bVal == null) return 0;
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const selectableRows = isRowSelectable ? sortedData.filter(isRowSelectable) : sortedData;
  const selectableRowIds = selectableRows.map((r) => r[keyField]);
  const allSelected = selectableRowIds.length > 0 && selectableRowIds.every((id) => selectedIds.includes(id));
  const someSelected = selectableRowIds.some((id) => selectedIds.includes(id)) && !allSelected;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleToggleAll = () => {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange([], []);
    } else {
      const newSelected = selectableRows.filter((r) => isRowSelectable ? isRowSelectable(r) : true);
      onSelectionChange(
        newSelected.map((r) => r[keyField]),
        newSelected,
      );
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleToggleRow = (row: any) => {
    if (!onSelectionChange) return;
    const id = row[keyField];
    let newIds: number[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let newRows: any[];
    if (selectedIds.includes(id)) {
      newIds = selectedIds.filter((x) => x !== id);
      newRows = selectedIds.filter((x) => x !== id).map((sid) => sortedData.find((r) => r[keyField] === sid)).filter(Boolean);
    } else {
      newIds = [...selectedIds, id];
      const existingRows = selectedIds.map((sid) => sortedData.find((r) => r[keyField] === sid)).filter(Boolean);
      newRows = [...existingRows, row];
    }
    onSelectionChange(newIds, newRows);
  };

  return (
    <div>
      {filters && <div className="mb-4 flex flex-wrap gap-3">{filters}</div>}
      <div className="overflow-x-auto bg-white rounded-lg border border-slate-200 shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {selectable && (
                <th className="px-4 py-3 text-left font-medium text-slate-600 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={handleToggleAll}
                    className="rounded text-amber-500 focus:ring-amber-400"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-left font-medium text-slate-600 whitespace-nowrap"
                >
                  {col.sortable ? (
                    <button
                      onClick={() => handleSort(col.key)}
                      className="flex items-center gap-1 hover:text-slate-900 transition-colors"
                    >
                      {col.title}
                      {sortKey === col.key ? (
                        sortDir === 'asc' ? (
                          <ChevronUp size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )
                      ) : (
                        <ChevronUp size={14} className="text-slate-300" />
                      )}
                    </button>
                  ) : (
                    col.title
                  )}
                </th>
              ))}
              {actions && (
                <th className="px-4 py-3 text-left font-medium text-slate-600">操作</th>
              )}
            </tr>
          </thead>
          <tbody>
            {sortedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (actions ? 1 : 0) + (selectable ? 1 : 0)}
                  className="px-4 py-8 text-center text-slate-400"
                >
                  暂无数据
                </td>
              </tr>
            ) : (
              sortedData.map((row, idx) => {
                const rowSelectable = !isRowSelectable || isRowSelectable(row);
                const isSelected = selectedIds.includes(row[keyField]);
                return (
                  <tr
                    key={String(row[keyField] ?? idx)}
                    className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                      idx % 2 === 1 ? 'bg-slate-50/50' : ''
                    } ${isSelected ? 'bg-amber-50/60' : ''}`}
                  >
                    {selectable && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!rowSelectable}
                          onChange={() => handleToggleRow(row)}
                          className="rounded text-amber-500 focus:ring-amber-400 disabled:opacity-40"
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-3 text-slate-700 whitespace-nowrap">
                        {col.render ? col.render(row) : String(row[col.key] ?? '')}
                      </td>
                    ))}
                    {actions && (
                      <td className="px-4 py-3 whitespace-nowrap">{actions(row)}</td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
