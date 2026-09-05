export interface Environment {
  id: string;
  name: string;
  texture: string;
  initialYaw: number;
}

export const environments: Environment[] = [
  { id: 'dream', name: '星海浅眠', texture: `${import.meta.env.BASE_URL}environments/dream-sea.png`, initialYaw: 0.62 },
  { id: 'lake', name: '清晨湖畔', texture: `${import.meta.env.BASE_URL}environments/quiet-lake.png`, initialYaw: 0 },
];
