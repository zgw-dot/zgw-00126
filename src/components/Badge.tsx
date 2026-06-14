type BadgeVariant = 'active' | 'pending' | 'approved' | 'rejected' | 'cancelled' | 'overridden' | 'scheduled' | 'auto' | 'manual_override' | 'withdrawn';

const variantClasses: Record<BadgeVariant, string> = {
  active: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-500',
  overridden: 'bg-purple-100 text-purple-700',
  scheduled: 'bg-blue-100 text-blue-700',
  auto: 'bg-emerald-100 text-emerald-700',
  manual_override: 'bg-purple-100 text-purple-700',
  withdrawn: 'bg-slate-100 text-slate-500',
};

const variantLabels: Record<BadgeVariant, string> = {
  active: '生效',
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
  cancelled: '已取消',
  overridden: '已覆盖',
  scheduled: '已安排',
  auto: '自动',
  manual_override: '人工',
  withdrawn: '已撤回',
};

interface BadgeProps {
  variant: BadgeVariant;
  label?: string;
}

export default function Badge({ variant, label }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${variantClasses[variant] || 'bg-slate-100 text-slate-500'}`}
    >
      {label || variantLabels[variant] || variant}
    </span>
  );
}
