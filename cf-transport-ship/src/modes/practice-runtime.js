// 练习模式运行时纯逻辑：包装已审核的 PracticeSession 纯核心，无 DOM/Three/存储/全局时钟/随机数。
// Game 集成契约：
//  - 靶体：构造时注入地图靶点布局元数据 spots（契约见 practice-targets.js 头注释），
//    运行时生成靶体状态并以其 { id, pos } 驱动 PracticeSession（会话把 pos 视为不透明数据透传）。
//  - 命中：两条接缝——hitScan(origin, dir, maxDist) 用射线-球判定选靶并登记，适合即时弹道；
//    registerHit(id) 供 Game 用自己的弹道/投掷物命中结果直接登记，未知/非法 ID 安全忽略。
//  - 换枪：任意换枪是练习模式规则，校验只读 src/weapons.js 公开目录 WEAPONS；
//    合法目录枪械（含近战、投掷物）全部可选。投掷物槽位语义：slot 3 三选一，
//    后选替换先选（与实战背包一致）。不涉及 UI/HUD，选择结果经 snapshot 暴露。
//  - 时间：只通过 update(dt) 推进；暂停 = 不调用 update 即冻结（核心契约透传）。
//  - reset：清空命中统计与模拟时间；换枪选择属于玩家偏好，重开一局保留。

import { PracticeSession } from './practice.js';
import { createTargetStates, pickTarget } from './practice-targets.js';
import { WEAPONS } from '../weapons.js';

export class PracticeRuntime {
  constructor({ spots = [] } = {}) {
    this.states = createTargetStates(spots);
    this.session = new PracticeSession({
      targets: this.states.map((s) => ({ id: s.id, pos: s.pos })),
    });
    this.slots = {}; // slot -> 当前选中的枪械 ID（投掷物 slot 3 轮换替换）
    this.current = null;
  }

  // 只读校验：待选枪是否在公开目录中（练习模式不做任何额外限制）。
  // 必须用 hasOwn 只查自有键：'toString'/'constructor' 等原型链成员名不是目录枪械。
  canSelectWeapon(id) {
    return typeof id === 'string' && id.length > 0 && Object.hasOwn(WEAPONS, id);
  }

  // 任意换枪：合法即生效并记录槽位归属；非法输入返回 false 且不改变当前选择
  selectWeapon(id) {
    if (!this.canSelectWeapon(id)) return false;
    const def = WEAPONS[id];
    this.slots[def.slot] = id;
    this.current = id;
    return true;
  }

  // 即时弹道命中：射线-球判定最近可见靶并登记。返回 { id, dist, point } 或 null（落空/无效射线）。
  hitScan(origin, dir, maxDist = Infinity) {
    const hit = pickTarget(this.states, origin, dir, maxDist);
    if (!hit) return null;
    this.session.hit(hit.id);
    return hit;
  }

  // 命中登记接缝：Game 用自己的弹道命中结果调用；透传会话的未知/非法 ID 忽略语义
  registerHit(id) {
    return this.session.hit(id);
  }

  // 只按模拟 dt 推进（衰减受击反应、累计时间）；暂停 = 不调用即冻结
  update(dt) {
    this.session.update(dt);
  }

  // 重开一局：清空命中统计与模拟时间，保留靶子结构与换枪选择
  reset() {
    this.session.reset();
  }

  // 会话快照透传 + 换枪状态，整体可序列化，供 HUD 渲染
  snapshot() {
    return {
      ...this.session.snapshot(),
      weapon: { slots: { ...this.slots }, current: this.current },
    };
  }
}
