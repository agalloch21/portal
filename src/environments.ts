import type { Atmosphere } from './ambient';
export interface Environment {
  id: string;
  name: string;
  description: string;
  texture: string;
  preview: string;
  resolution: string;
  source: 'photo' | 'generated';
  atmosphere: Atmosphere;
  initialYaw: number;
  themeColor: string;
}
const path = (file: string) => `${import.meta.env.BASE_URL}environments/${file}`;
export const environments: Environment[] = [
  { id: 'dream', name: '星海浅眠', description: '最初的星海', texture: path('dream-sea.png'), preview: path('dream-sea.png'), resolution: '生成全景', source: 'generated', atmosphere: 'dream', initialYaw: .62, themeColor: '#a99ac3' },
  { id: 'underwater', name: '浅蓝之下', description: '沉入一片柔软的蓝', texture: path('underwater.png'), preview: path('underwater-preview.webp'), resolution: '生成全景', source: 'generated', atmosphere: 'underwater', initialYaw: 1.05, themeColor: '#3b9bb0' },
  { id: 'space', name: '星云缓行', description: '等一颗流星轻轻经过', texture: path('nebula.png'), preview: path('nebula-preview.webp'), resolution: '生成全景', source: 'generated', atmosphere: 'space', initialYaw: .65, themeColor: '#81768e' },
  { id: 'greenhouse', name: '星间花房', description: '窗边有绿意，窗外是宇宙', texture: path('star-greenhouse.png'), preview: path('star-greenhouse-preview.webp'), resolution: '生成全景', source: 'generated', atmosphere: 'greenhouse', initialYaw: 0, themeColor: '#9a9087' },
  { id: 'clouds', name: '云端花海', description: '云海缓缓流过，花岛静静漂浮', texture: path('clouds.png'), preview: path('clouds-preview.webp'), resolution: '生成全景', source: 'generated', atmosphere: 'clouds', initialYaw: 0, themeColor: '#c99fb3' },
  { id: 'moonforest', name: '月隐灵森', description: '月光下，独角兽与萤火等你停留', texture: path('moonforest.png'), preview: path('moonforest-preview.webp'), resolution: '生成全景', source: 'generated', atmosphere: 'moonforest', initialYaw: .28, themeColor: '#203d46' },
  { id: 'forest', name: '林间微光', description: '树荫里，光慢慢落下来', texture: path('forest-8k.jpg'), preview: path('forest-preview.webp'), resolution: '8K 全景', source: 'photo', atmosphere: 'forest', initialYaw: 1.05, themeColor: '#647768' },
  { id: 'lake', name: '清晨湖畔', description: '黎明，让湖面慢慢亮起来', texture: path('lake-8k.jpg'), preview: path('lake-preview.webp'), resolution: '8K 全景', source: 'photo', atmosphere: 'lake', initialYaw: 0, themeColor: '#8a9087' },
];
