import { getInitials } from '@/lib/format';

interface AvatarProps {
  name: string;
  src?: string;
  size?: number;
  className?: string;
  ring?: boolean;
}

const COLOR_PAIRS = [
  ['bg-accent-500', 'text-white'],
  ['bg-emerald-500', 'text-white'],
  ['bg-rose-500', 'text-white'],
  ['bg-amber-500', 'text-white'],
  ['bg-teal-500', 'text-white'],
  ['bg-cyan-600', 'text-white'],
  ['bg-orange-500', 'text-white'],
  ['bg-pink-500', 'text-white'],
];

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLOR_PAIRS[Math.abs(hash) % COLOR_PAIRS.length].join(' ');
}

export default function Avatar({ name, src, size = 40, className = '', ring = false }: AvatarProps) {
  const fontSize = Math.max(11, Math.floor(size * 0.38));
  const ringCls = ring ? 'ring-2 ring-white dark:ring-ink-900' : '';

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={{ width: size, height: size }}
        className={`rounded-full object-cover shrink-0 ${ringCls} ${className}`}
      />
    );
  }

  return (
    <div
      style={{ width: size, height: size, fontSize }}
      className={`rounded-full flex items-center justify-center font-semibold shrink-0 ${colorForName(name)} ${ringCls} ${className}`}
    >
      {getInitials(name)}
    </div>
  );
}
