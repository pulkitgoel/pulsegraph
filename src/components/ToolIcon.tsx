import {
  ArrowCounterClockwise,
  BezierCurve,
  CaretDown,
  ChatCircle,
  CodeSimple,
  DownloadSimple,
  FileText,
  Gear,
  Gif,
  Image,
  Moon,
  Pause,
  Play,
  Presentation,
  SlidersHorizontal,
  Sun,
  UploadSimple,
} from '@phosphor-icons/react';

const icons = {
  settings: Gear,
  themeLight: Sun,
  themeDark: Moon,
  import: UploadSimple,
  play: Play,
  pause: Pause,
  source: CodeSimple,
  reset: ArrowCounterClockwise,
  chevron: CaretDown,
  export: DownloadSimple,
  chat: ChatCircle,
  tools: SlidersHorizontal,
  image: Image,
  motion: Gif,
  vector: BezierCurve,
  slide: Presentation,
  document: FileText,
};

export function ToolIcon({
  name,
  size = 16,
  className = 'tool-icon',
}: {
  name: keyof typeof icons;
  size?: number;
  className?: string;
}) {
  const Glyph = icons[name];
  return <Glyph size={size} weight="regular" className={className} aria-hidden />;
}
