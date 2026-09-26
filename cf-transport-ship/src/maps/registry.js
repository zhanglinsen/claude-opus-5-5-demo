// 地图注册表（纯数据 + 解析函数，不依赖 three / DOM，可在 node 下测试）
// 每张地图描述：元信息、寻路范围、小地图参数、菜单镜头、AI 常量与换弹出生区判定。
// 运输船沿用原 buildMap（见 src/map.js）；沙漠灰阶段 2 前仅元数据，available=false。

export const MAPS = {
  'transport-ship': {
    id: 'transport-ship',
    name: '运输船',
    en: 'TRANSPORT SHIP',
    available: true,
    supportedModes: ['tdm'],
    defaultMode: 'tdm',
    loadingLabel: '搭建运输船',
    nav: { x0: -36.2, z0: -12.1, x1: 36.2, z1: 12.1, cell: 0.5, agentR: 0.42 },
    // 可玩区域边界（与甲板舷侧 invisible 墙一致）；出生点必须落在界内
    bounds: { x0: -36.6, z0: -12.15, x1: 36.6, z1: 12.15 },
    radar: {
      widthM: 74, heightM: 26, offX: 37, offZ: 13,
      maxColliderHalf: 30, // 过滤船体级大碰撞体
      overlays: [ // 二楼管道顶棚（虚线框）
        { x: -29.5, z: 9.4, w: 36.6, h: 2.44 },
        { x: -7.1, z: -11.84, w: 36.6, h: 2.44 },
      ],
    },
    menu: {
      orbit: { r: 46, rOff: -6, y: 13, yAmp: 3, zR: 34, look: [-4, 1.5, 0], fov: 60, speed: 0.045 },
      blurb: '联合国维和行动在监视非法军火出口时，发现一艘从俄罗斯驶往尼日利亚的可疑货轮。保卫者（Global Risk）奉命登船突击检查，却遭到潜伏者（Black List）伏击。<br>船头船尾两个船舱出生，中路 V 形斜放集装箱、两侧 L 形箱堆，左右各有一条只能从己方出生点进入的集装箱管道，管道顶上就是可以架枪的二楼。',
    },
    env: { shipSpeed: 6.5 },
    ambientKey: 'funnelTop', // 烟囱冒烟等环境氛围取构建结果字段
    // 出生点契约：buildMap 返回 spawns[team] = [{x, y, z, yaw}]，y 为脚底站立面高度；
    // Actor.spawn 以 sp.y 为出生高度，缺失时安全回退 0.02。
    spawnYFallback: 0.02,
    // 换背包「立即生效」的出生区判定（复活生效兜底在模式层）
    loadoutZone: { BL: { axis: 'x', max: -28.3 }, GR: { axis: 'x', min: 28.3 } },
    ai: {
      holds: [[-20.5, -7.2, 0.2], [-24.6, 5.8, -0.15], [-16.4, 1.3, 0.1], [-9.8, -6.8, 0.25], [-26.2, -6.5, 0.05]],
      lanes: [-6.8, -0.4, 6.8],
      flank: [[-31.5, 10.5], [-8, 10.6], [8.0, 7.8]],
      rushZone: { x0: 4, x1: 22 },
      roam: { x0: -26, z0: -8.8, x1: 26, z1: 8.8 },
    },
  },
  'desert-grey': {
    id: 'desert-grey',
    name: '沙漠灰',
    en: 'DESERT GREY',
    available: false, // 阶段 2 起开放；当前仅在菜单中展示为「待开放」
    supportedModes: ['bomb', 'tdm', 'practice'],
    defaultMode: 'bomb',
    loadingLabel: '搭建沙漠灰',
  },
};

// 新玩家默认地图（沙漠灰开放前由 resolveMapId 回退到第一张可用地图）
export const NEW_PLAYER_DEFAULT_MAP = 'desert-grey';

export function getMapDescriptor(id) { return MAPS[id] || null; }

export function firstAvailableMapId() {
  for (const k of Object.keys(MAPS)) if (MAPS[k].available) return k;
  return null;
}

// 解析顺序：URL 参数 > 已存设置 > 新玩家默认 > 第一张可用地图；不可用的地图一律跳过
export function resolveMapId(requested, stored) {
  for (const c of [requested, stored, NEW_PLAYER_DEFAULT_MAP]) {
    if (c && MAPS[c] && MAPS[c].available) return c;
  }
  return firstAvailableMapId();
}

// 出生区内换背包立即生效
export function inSpawnZone(desc, team, pos) {
  const z = desc && desc.loadoutZone && desc.loadoutZone[team];
  if (!z || z.axis !== 'x') return false;
  if (z.max !== undefined) return pos.x < z.max;
  if (z.min !== undefined) return pos.x > z.min;
  return false;
}
