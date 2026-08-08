import type { SVGProps } from 'react';

// أيقونات خطية موحّدة (24×24، currentColor) — بديل احترافي للإيموجي، بدون مكتبات خارجية.
const PATHS: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5',
  chart: 'M4 20V4M4 20h16M8 20v-6M13 20V9M18 20v-9',
  factory: 'M3 21V10l6 4V10l6 4V6l6 4v11H3ZM7 21v-4M12 21v-4M17 21v-4',
  clipboard: 'M9 4h6v3H9zM9 5H6v16h12V5h-3M9 12h6M9 16h4',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6M9 16h3',
  tag: 'M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9ZM7.5 7.5h.01',
  card: 'M3 6h18v12H3zM3 10h18',
  ship: 'M3 15l1.5 5.5a2 2 0 0 0 2 1.5h11a2 2 0 0 0 2-1.5L21 15M5 15V8l7-3 7 3v7M12 5V2M9 15V9m6 6V9',
  users: 'M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM17 4.5a3.5 3.5 0 0 1 0 7M21 20v-1a4 4 0 0 0-3-3.8',
  building: 'M4 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17M15 21V9h4a1 1 0 0 1 1 1v11M4 21h17M7 7h2M7 11h2M7 15h2',
  file: 'M6 2h8l6 6v14H6zM14 2v6h6M9 14h6M9 18h6',
  coins: 'M9 8.5a5 3 0 1 0 0-.001M4 8.5v4c0 1.7 2.2 3 5 3s5-1.3 5-3v-4M14 12v3c0 1.7 2.2 3 5 3s1-.1 1-.1',
  check: 'M9 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM9.5 12l2 2 3.5-4',
  shield: 'M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3ZM9.5 12l2 2 3.5-4',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.5 2.5 3.5 5.7 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.7-3.5-9s1-6.5 3.5-9Z',
  logout: 'M15 12H3m0 0 4-4m-4 4 4 4M10 5V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-1',
  menu: 'M4 6h16M4 12h16M4 18h16',
  x: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  chevronDown: 'M6 9l6 6 6-6',
  chevronRight: 'M9 6l6 6-6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: string;
  size?: number;
}

export function Icon({ name, size = 20, strokeWidth = 1.8, ...rest }: IconProps & { strokeWidth?: number }) {
  const d = PATHS[name] || PATHS.file;
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth as number}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}
    >
      {d.split('M').filter(Boolean).map((seg, i) => <path key={i} d={'M' + seg} />)}
    </svg>
  );
}

export default Icon;
