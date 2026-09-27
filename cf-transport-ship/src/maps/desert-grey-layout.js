// 沙漠灰布局数据（纯数据，不依赖 three / DOM，可在 node 下测试与校验）
// 坐标约定（与阶段 2 并行契约一致）：
//   +X 东 = A 方向，-X 西 = B 方向，-Z 北 = 保卫者(GR)端，+Z 南 = 潜伏者(BL)端
//   y 为脚底站立面高度；单位米；站姿约 1.75m
// 比例说明：按参考俯视图（olimg 1521711094）与人物尺度估算为约 88m × 76m 的白盒尺度，
// 并非精确还原原版尺寸；地标相对方位/层高关系按经典布局重建。
//
// 层高方案：
//   地面 y=0（沙地）；上层步道/平台/上层坑道 y=2.6（桥下净空 2.3）；
//   A大坑坑底 y=-1.8（两端坡道进出）；B洞下层 y=0 顶板 2.3。
//
// 结构数据：solids（碰撞盒，与视觉一一对应）、ramps（契约定义的坡面 API 数据）。
// 视觉装饰（屋顶檐口、远景建筑、包点喷漆、灯具）由 desert-grey.js 构建时补充，不参与碰撞。

const UPPER = 2.6;    // 上层步道/平台面
const PIT = -1.8;     // A大坑坑底
const WALL = 0.4;     // 常规内墙厚

// ---------- 小工具（仅在模块加载期生成纯数据） ----------
const solids = [];
let sid = 0;
function S(x, y, z, sx, sy, sz, o = {}) {
  solids.push({
    id: o.id || ('s' + (++sid)),
    x, y, z, sx, sy, sz,
    yaw: o.yaw || 0,
    role: o.role || 'wall',            // floor|wall|ceil|struct|step|cover|door|bound
    m: o.m || 'plaster',               // 视觉材质键（desert-grey-materials）
    mat: o.mat || 'concrete',          // 命中材质 metal|wood|concrete
    surface: o.surface || 'stone',     // 脚步声
    bullet: o.bullet || 'block',
    sight: o.sight !== false,
    solid: o.solid !== false,
    tag: o.tag || '',
  });
}
// 墙：给起止范围与高度
function W(x0, x1, z0, z1, y0, y1, o = {}) {
  S((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, o);
}
// 楼梯：n 级踏步（可碰撞浅台阶，运输船楼梯同款做法），dir: 'x+'| 'x-' | 'z-' | 'z+'（抬升方向）
function Stairs(x0, x1, z0, z1, h, n, dir, o = {}) {
  const dx = (x1 - x0) / n, dz = (z1 - z0) / n;
  for (let i = 0; i < n; i++) {
    const hh = (h / n) * (i + 1);
    let cx, cz, sx, sz;
    if (dir === 'x+') { cx = x0 + (i + 0.5) * dx; cz = (z0 + z1) / 2; sx = dx; sz = z1 - z0; }
    else if (dir === 'x-') { cx = x1 - (i + 0.5) * dx; cz = (z0 + z1) / 2; sx = dx; sz = z1 - z0; }
    else if (dir === 'z-') { cx = (x0 + x1) / 2; cz = z1 - (i + 0.5) * dz; sx = x1 - x0; sz = Math.abs(dz); }
    else { cx = (x0 + x1) / 2; cz = z0 + (i + 0.5) * dz; sx = x1 - x0; sz = Math.abs(dz); }
    S(cx, hh / 2, cz, sx, hh, sz, { role: 'step', m: o.m || 'concrete', mat: 'concrete', surface: 'stone', tag: o.tag || 'stairs' });
  }
}
function Crates(list) {
  for (const [x, z, s, y0 = 0, yaw = 0] of list) {
    S(x, y0 + s / 2, z, s, s, s * 0.96, { role: 'cover', m: 'wood', mat: 'wood', bullet: 'pen', surface: 'wood', yaw, tag: 'crate' });
  }
}

// ================== 地面（顶面 y=0，A大坑区域挖除单独铺坑底） ==================
W(-44, 26, -38, 38, -1, 0, { role: 'floor', m: 'sand', surface: 'sand', id: 'groundW' });
W(26, 34, -38, -6, -1, 0, { role: 'floor', m: 'sand', surface: 'sand', id: 'groundPitN' });
W(26, 34, 10, 38, -1, 0, { role: 'floor', m: 'sand', surface: 'sand', id: 'groundPitS' });
W(34, 44, -38, 38, -1, 0, { role: 'floor', m: 'sand', surface: 'sand', id: 'groundE' });
W(26, 34, -6, 10, PIT - 1, PIT, { role: 'floor', m: 'stone', id: 'pitFloor' });

// ================== 地图边界墙（防越界，高出檐口） ==================
W(-44.6, 44.6, -38, -37.4, 0, 7, { role: 'bound', m: 'plaster', id: 'boundN' });
W(-44.6, 44.6, 37.4, 38, 0, 7, { role: 'bound', m: 'plaster', id: 'boundS' });
W(-44, -43.4, -38, 38, 0, 7, { role: 'bound', m: 'plaster', id: 'boundW' });
W(43.4, 44, -38, 38, 0, 7, { role: 'bound', m: 'plaster', id: 'boundE' });

// ================== 大体量建筑（封死非通路区域，形成街巷轮廓） ==================
// 中路西侧楼（B库房→中央大厅）：外壳包络保持 x[-20,-6] z[-24,2] 高 5.5 不变，
// 内部掏空为可进入大厅（对应 dg-ref2/ref2-a01 木门与 ref2-a05 大空间室内）。
// 东墙面向中路留 2.6m 门洞（z[-13,-10.4]），4.4 起为顶板；外轮廓与檐口线保持不变。
W(-6.4, -6, -24, -13, 0, 4.4, { role: 'wall', m: 'plasterB', id: 'midHallE1' });   // 大厅东墙北段
W(-6.4, -6, -10.4, 2, 0, 4.4, { role: 'wall', m: 'plasterB', id: 'midHallE2' });   // 大厅东墙南段
W(-6.4, -6, -13, -10.4, 2.6, 4.4, { role: 'wall', m: 'plasterB', id: 'midHallLintel' }); // 门洞楣
W(-20, -19.6, -24, 2, 0, 4.4, { role: 'wall', m: 'plasterB', id: 'midHallW' });    // 大厅西墙
W(-20, -6, -24, -23.6, 0, 4.4, { role: 'wall', m: 'plasterB', id: 'midHallS' });   // 大厅南墙
W(-20, -6, 1.6, 2, 0, 4.4, { role: 'wall', m: 'plasterB', id: 'midHallN' });       // 大厅北墙（背靠桥下）
W(-20, -6, -24, 2, 4.4, 5.5, { role: 'ceil', m: 'concrete', id: 'midHallRoof' });  // 大厅顶板（保持 5.5 外轮廓）
S(-6.6, 1.3, -12.45, 0.2, 2.6, 1.1, { role: 'door', m: 'woodDoor', mat: 'wood', bullet: 'pen', surface: 'wood', id: 'midHallDoorLeaf' }); // 半开木门扇（向厅内敞开）
S(-12, 1, -8, 2, 2, 2, { role: 'cover', m: 'wood', mat: 'wood', bullet: 'pen', surface: 'wood', tag: 'crate', id: 'midHallCrate1' });     // 室内木箱
S(-10.5, 0.8, -19, 1.6, 1.6, 1.6, { role: 'cover', m: 'wood', mat: 'wood', bullet: 'pen', surface: 'wood', tag: 'crate', id: 'midHallCrate2' });
S(-16, 1.3, -16, 1.6, 2.6, 1.6, { role: 'cover', m: 'wood', mat: 'wood', bullet: 'pen', surface: 'wood', tag: 'crate', id: 'midHallCrate3' });
W(-26, -6, 6, 8, 0, 2.6, { role: 'struct', m: 'plasterB', id: 'bldUpBase' });      // 上层坑道口下方基座
W(-38, -32, 6, 8, 2.6, 5.5, { role: 'struct', m: 'plasterB', id: 'bldUpW' });      // 坑道西侧楼上部
W(34, 44, -10, 38, 0, 5.5, { role: 'struct', m: 'plasterB', id: 'bldEast' });      // A大街东侧楼
W(10, 24, 32, 38, 0, 5.5, { role: 'struct', m: 'plasterB', id: 'bldAentS' });
W(24, 34, 32, 38, 0, 5.5, { role: 'struct', m: 'plasterB', id: 'bldAlongS' });
W(6, 14, -28, -19, 0, 5.5, { role: 'struct', m: 'plasterB', id: 'bldMidE1' });     // 中路东北楼
W(14, 26, -28, -19, 0, 5.5, { role: 'struct', m: 'plasterB', id: 'bldMidE2' });
W(-44, -38, -10, 38, 0, 5.5, { role: 'struct', m: 'plasterB', id: 'bldWestS' });   // B区西南楼
W(-38, -34, 8, 38, 0, 5.5, { role: 'struct', m: 'plasterB', id: 'bldWestG' });
W(-38, -26, 6, 8, 0, 2.6, { role: 'struct', m: 'plasterB', id: 'bldUpS0' });       // 桥下南墙基座
W(-26, -12, -38, -36, 0, 5.5, { role: 'struct', m: 'plasterB', id: 'bldBC' });     // B连接北侧楼
// 潜伏者前院两侧的连片街屋：保留 x≈0 的中路主轴、x≈-11 的 B 向
// 巷道与 x≈10 的 A 向巷道，同时形成真实转角遮挡和不规则屋顶轮廓。
W(-9, -3, 14, 21, 0, 6.8, { role: 'struct', m: 'plasterB', id: 'bldYardW' });
W(4, 8, 15, 22, 0, 5.8, { role: 'struct', m: 'plasterB', id: 'bldYardCenter' });
W(15, 22, 14, 24, 0, 5.2, { role: 'struct', m: 'plasterB', id: 'bldYardE' });
// B窗房下方与南侧实体（顶面 2.6 即房间地板）
W(-26, -25.2, -28, 2, 0, 2.6, { role: 'struct', m: 'concrete', id: 'bWinSupW' });
W(-20.8, -20, -28, 2, 0, 2.6, { role: 'struct', m: 'concrete', id: 'bWinSupE' });
W(-25.2, -20.8, -27, 2, 0, 2.6, { role: 'struct', m: 'concrete', id: 'bWinSupC' }); // GR 楼梯洞口让位
W(-26, -20, 1.8, 2.2, 2.6, 4, { role: 'wall', m: 'plaster', id: 'bWinRail' });      // 房顶南沿矮墙

// ================== 中路 ==================
W(5.8, 6.2, -15, 8, 0, 4.2, { role: 'wall', m: 'plaster', id: 'midWallE' });        // 东墙（A小道楼梯开口 z[-19,-15]）
// 中门：墙体留 1.4m 中缝，双木门板封闭两侧
W(-6, -0.7, -24.2, -23.8, 0, 4.2, { role: 'wall', m: 'plaster', id: 'midDoorWallL' });
W(0.7, 6, -24.2, -23.8, 0, 4.2, { role: 'wall', m: 'plaster', id: 'midDoorWallR' });
W(-2.7, 2.7, -24.2, -23.8, 2.6, 4.2, { role: 'wall', m: 'plaster', id: 'midDoorLintel' });
S(-1.7, 1.3, -24, 2, 2.6, 0.3, { role: 'door', m: 'woodDoor', mat: 'wood', bullet: 'pen', surface: 'wood', id: 'midDoorL' });
S(1.7, 1.3, -24, 2, 2.6, 0.3, { role: 'door', m: 'woodDoor', mat: 'wood', bullet: 'pen', surface: 'wood', id: 'midDoorR' });

// ================== 桥下（中路 → B 洞下层的屋顶通道）与上层坑道 ==================
// 桥下通道 x[-38,-6] z[2,6] 净空 2.3，顶板即「桥」面（x[-32,-26] 段为 B 洞上层坑道地板）
W(-26, -6, 2, 6, 2.3, 2.6, { role: 'ceil', m: 'concrete', id: 'upRoofE' });
W(-26, -6, 2, 6, 2.6, 5.5, { role: 'struct', m: 'plasterB', id: 'upRoofEMass' });
W(-38, -32, -10, 6, 2.3, 2.6, { role: 'ceil', m: 'concrete', id: 'lowRoof' });      // B 洞下层顶板
W(-38, -32, -10, 6, 2.6, 5.5, { role: 'struct', m: 'plasterB', id: 'lowRoofMass' });
// B 洞上层坑道 x[-32,-26] z[-14,8]，地板 2.6（跨在桥下之上 = 桥）
W(-32, -26, -14, 8, 2.3, 2.6, { role: 'floor', m: 'concrete', id: 'upFloor' });
W(-32.2, -31.8, -14, 2, 0, 5.2, { role: 'wall', m: 'plaster', id: 'upWallW' });
W(-26.2, -25.8, -10, 8, 2.6, 5.2, { role: 'wall', m: 'plaster', id: 'upWallE' });
W(-32, -26, -14.2, -13.8, 0, 5.2, { role: 'wall', m: 'plaster', id: 'upCapN' });    // 北端封墙（下段防钻入）
W(-32, -26, -14, 8, 5.2, 5.5, { role: 'ceil', m: 'concrete', id: 'upCeil' });
// 上层入口大台阶（后花园 → 2.6）
Stairs(-32, -26, 8, 16, UPPER, 10, 'z-', { tag: 'bUpperStairs' });

// ================== B 区 ==================
// B 区东墙 x=-26（B门 z[-35,-32]、B窗两扇窗洞、上层坑道房门 z[-13,-10]）
W(-26.2, -25.8, -38, -35, 0, 5.2, { role: 'wall', m: 'plaster', id: 'bWallE1' });
W(-26.2, -25.8, -32, -28, 0, 5.2, { role: 'wall', m: 'plaster', id: 'bWallE2' });
W(-26.2, -25.8, -35, -32, 3.0, 5.2, { role: 'wall', m: 'plaster', id: 'bDoorLintel' });
W(-26.2, -25.8, -28, -13, 0, 3.6, { role: 'wall', m: 'plaster', id: 'bWallLow1' }); // 窗下墙（兼房地板支座）
W(-26.2, -25.8, -13, -10, 0, 2.3, { role: 'wall', m: 'plaster', id: 'bWallLow2' }); // 房门 z[-13,-10] 下槛（上为上层坑道地板）
W(-26.2, -25.8, -28, -10, 4.8, 5.2, { role: 'wall', m: 'plaster', id: 'bWallTop' });
W(-26.2, -25.8, -28, -26, 3.6, 4.8, { role: 'wall', m: 'plaster', id: 'bWinMull1' });
W(-26.2, -25.8, -22, -18, 3.6, 4.8, { role: 'wall', m: 'plaster', id: 'bWinMull2' });
W(-26.2, -25.8, -14, -13, 3.6, 4.8, { role: 'wall', m: 'plaster', id: 'bWinMull3' });
// B 门木门（一扇封闭、一扇向 B 区内侧敞开贴墙；留出北侧 1.9m 走位带）
S(-26, 1.5, -34.45, 0.3, 3.0, 1.1, { role: 'door', m: 'woodDoor', mat: 'wood', bullet: 'pen', surface: 'wood', id: 'bDoorPanel1' });
S(-26.55, 1.5, -31.55, 0.12, 3.0, 1.1, { role: 'door', m: 'woodDoor', mat: 'wood', bullet: 'pen', surface: 'wood', id: 'bDoorPanel2' });
// B 窗房（地板 2.6 即上方实体顶面，房墙/顶如下）
W(-20.2, -19.8, -28, -10, 0, 5.2, { role: 'wall', m: 'plaster', id: 'bWinWallE' });
W(-26, -25.2, -28.2, -27.8, 2.6, 5.2, { role: 'wall', m: 'plaster', id: 'bWinWallN1' });
W(-20.8, -20, -28.2, -27.8, 2.6, 5.2, { role: 'wall', m: 'plaster', id: 'bWinWallN2' });
// 北墙中部 x[-25.2,-20.8] 留洞：GR 楼梯由此上进入 B 窗房
W(-26, -20, -28, -10, 5.2, 5.5, { role: 'ceil', m: 'concrete', id: 'bWinCeil' });
// B连接北楼与 B 区之间已由东墙封堵；GR 上 B 窗楼梯（穿 bWinSupC 洞口；北端缩至 z=-32.2 让出门前通道）
Stairs(-25, -21, -32.2, -27, UPPER, 10, 'z+', { tag: 'bWinStairs' });

// ================== A 大 / A 大坑 / A 门 ==================
W(23.8, 24.2, -10, 28, 0, 4.6, { role: 'wall', m: 'plaster', id: 'aLongWallW' });   // 西墙（A大入口开口 z[28,32]）
// 东墙由 bldEast (x=34) 形成
W(24, 27, -10.2, -9.8, 0, 4.6, { role: 'wall', m: 'plaster', id: 'aDoorWallW' });   // A 门墙
W(31, 34, -10.2, -9.8, 0, 4.6, { role: 'wall', m: 'plaster', id: 'aDoorWallE' });
W(27, 31, -10.2, -9.8, 3.2, 4.6, { role: 'wall', m: 'plaster', id: 'aDoorLintel' });
S(30.1, 1.55, -10, 1.9, 3.1, 0.12, { role: 'door', m: 'woodDoor', mat: 'wood', bullet: 'pen', surface: 'wood', yaw: 1.15, id: 'aDoorPanel' }); // 半开大门（靠东门轴）
// 坑壁（坑底 -1.8 与地面 0 之间的立面）
W(34, 34.4, -6, 10, PIT - 1, 0, { role: 'wall', m: 'stone', id: 'pitWallE' });
W(25.8, 26.2, -6, 10, PIT - 1, 0, { role: 'wall', m: 'stone', id: 'pitWallW' });

// ================== A 区 / A 平台 / A 小道 ==================
W(25.8, 26.2, -38, -36, 0, 5.2, { role: 'wall', m: 'plaster', id: 'aSiteWallW1' });
W(25.8, 26.2, -28, -19, 0, 5.2, { role: 'wall', m: 'plaster', id: 'aSiteWallW2' });
W(25.8, 26.2, -15, -10, 0, 5.2, { role: 'wall', m: 'plaster', id: 'aSiteWallW3' });
W(25.8, 26.2, -36, -28, 3.4, 5.2, { role: 'wall', m: 'plaster', id: 'aSiteLintelS' }); // GR A连接门楣
W(25.8, 26.2, -19, -15, 4.9, 5.2, { role: 'wall', m: 'plaster', id: 'aSiteLintelC' }); // A小道口门楣
W(26, 32, -24, -14, 0, UPPER, { role: 'struct', m: 'concrete', id: 'aLedge' });        // A小道下台（顶面可行走，南留 A门通道）
W(34, 44, -38, -26, 0, UPPER, { role: 'struct', m: 'concrete', id: 'aPlatformMain' }); // A 包点主台
W(37, 44, -26, -18, 0, UPPER, { role: 'struct', m: 'concrete', id: 'aPlatformArm' });  // 向斜坡伸出的前臂，西侧留内凹转角
W(10, 26, -19, -15, 0, UPPER, { role: 'struct', m: 'concrete', id: 'aShortBase' });    // A 小道高台
W(10, 26, -15.1, -14.85, UPPER, 3.5, { role: 'cover', m: 'concrete', id: 'aShortParapet' }); // 小道南侧矮墙
Stairs(6, 10, -19, -15, UPPER, 10, 'x+', { tag: 'aShortStairs' });                     // A 小道楼梯（中路 → 2.6）
// A 平台以宽斜坡连接地面，轮廓和战斗视线均区别于 A 小道的窄楼梯。
Stairs(27, 31, -29, -24, UPPER, 10, 'z+', { tag: 'aLedgeStairs' });                    // 台边下行梯（北接台沿，南落 A 区地面）

// ================== 木箱掩体 ==================
Crates([
  // B 区：箱群靠西墙/包点侧后（避开导航直线，保持包点掩体）
  [-42.3, -20, 1.4], [-42.3, -20, 1.1, 1.4], [-41.2, -22.6, 1.2, 0, 0.3], [-33, -24.5, 1.3],
  [-40.8, -31, 1.1],
  [-30, -13.5, 1.3],
  [28.5, -13, 1.3], [33, -35, 1.4, 0, 0.2], [31, -21, 1.4], [30.4, -19.6, 1.15, 0, 0.35],
  [42.5, -20.2, 1.2, UPPER],                                                 // A 平台上的木箱
  [42, -34, 1.4, UPPER], [42, -34, 1.1, UPPER + 1.4], [41.2, -35.6, 1.2, UPPER],
  [31, 22, 1.4], [32.6, 20.8, 1.1, 0, 0.3],                                  // A大（东移让出大街中线）
  [-22, 20, 1.4], [-17.8, 19.5, 1.1, 0, -0.3], [-18, 30, 1.3],               // 后花园
  [14, -10, 1.3], [15.4, -9.5, 1.1, 0, 0.25],                                // 中路东广场
]);

// ================== 坡道（契约 world.addRamp 数据；A大坑两端进出） ==================
const ramps = [
  { id: 'aPlatformRamp', x: 40, z: -15.5, sx: 4, sz: 5, y0: UPPER, y1: 0, axis: 'z', yaw: 0, thickness: 0.35, mat: 'concrete', surface: 'stone', tag: 'aPlatform', m: 'stone' },
  { id: 'pitRampS', x: 30, z: 8, sx: 8, sz: 4, y0: PIT, y1: 0, axis: 'z', yaw: 0, thickness: 0.3, mat: 'concrete', surface: 'stone', tag: 'aPit', m: 'concrete' },
  { id: 'pitRampN', x: 30, z: -4, sx: 8, sz: 4, y0: 0, y1: PIT, axis: 'z', yaw: 0, thickness: 0.3, mat: 'concrete', surface: 'stone', tag: 'aPit', m: 'concrete' },
];

// ================== 出生点（y=脚底站立面；yaw=0 朝北，PI 朝南） ==================
const spawns = { BL: [], GR: [] };
for (let i = 0; i < 5; i++) {
  const x = -12 + i * 5;
  spawns.BL.push({ x, y: 0, z: 33.5, yaw: 0 }, { x, y: 0, z: 30.5, yaw: 0 });
  spawns.GR.push({ x: x + 1, y: 0, z: -36.3, yaw: Math.PI }, { x: x + 1, y: 0, z: -33.3, yaw: Math.PI });
}

// ================== 报点区域（数组顺序即 regionAt 匹配优先级：具体在前） ==================
const R = (id, name, x0, x1, z0, z1, y0 = 0, y1 = 3) => ({ id, name, extents: { x0, x1, z0, z1, y0, y1 } });
const regions = [
  R('aPit', 'A大坑', 26, 34, -6, 10, -2.1, 0.6),
  R('aDoor', 'A门', 24, 34, -11, -9),
  R('aPlatform', 'A平台', 34, 44, -38, -18, 2.3, 4.4),
  R('aLedge', 'A小道下台', 26, 32, -24, -14, 2.3, 4.4),
  R('aShortStairs', 'A小道楼梯', 6, 10, -19, -15),
  R('aShort', 'A小道', 10, 26, -19, -15, 2.3, 4.4),
  R('aLongEnt', 'A大入口', 10, 26, 28, 32),
  R('aLong', 'A大', 24, 34, -10, 32),
  R('aSite', 'A区', 26, 44, -38, -10),
  R('aConnect', 'A连接', 14, 26, -36, -28),
  R('midDoors', '中门', -6, 6, -26, -22),
  R('mid', '中路', -6, 6, -24, 8),
  R('underpass', '桥下', -38, -6, 2, 6, 0, 2.6),
  R('bTunnelUpper', 'B洞上层', -32, -26, -14, 8, 2.3, 4.4),
  R('bTunnelLower', 'B洞下层', -38, -32, -10, 2),
  R('bWindow', 'B窗', -26, -20, -28, -10, 2.3, 4.4),
  R('bDoor', 'B门', -26, -24, -35, -32),
  R('bSite', 'B区', -44, -26, -38, -10),
  R('bUpperStairs', 'B洞上层楼梯', -32, -26, 8, 16),
  R('bConnect', 'B连接', -26, -12, -36, -28),
  R('grStairs', 'B窗楼梯', -25, -21, -33, -27),
  R('grSpawn', '保卫者出生点', -12, 14, -38, -30),
  R('grYard', '保卫者前庭', -12, 14, -31.5, -24),
  R('blSpawn', '潜伏者出生点', -14, 10, 28, 36),
  R('blYard', '潜伏者前院', -14, 26, 8, 28),
  R('backGarden', '后花园', -34, -14, 8, 36),
];

// ================== 包点 ==================
const bombSites = [
  { id: 'A', name: 'A区', x: 39, y: UPPER, z: -28, region: 'aPlatform', radius: 5.5 },
  { id: 'B', name: 'B区', x: -36, y: 0, z: -24, region: 'bSite', radius: 5.5 },
];

// ================== 导航图（y 为脚底高度；clearance 为该点可通过半径） ==================
const N = (id, x, y, z, region, clearance = 0.45) => ({ id, x, y, z, clearance, region });
const nodes = [
  // BL 出生与前院
  N('bl1', -11, 0, 32, 'blSpawn'), N('bl2', -3, 0, 32, 'blSpawn'), N('bl3', 5, 0, 32, 'blSpawn'),
  N('bl4', -11, 0, 35, 'blSpawn'), N('bl5', 5, 0, 35, 'blSpawn'),
  N('yd1', -11, 0, 24, 'blYard'), N('yd2', 0, 0, 24, 'blYard'), N('yd3', 10, 0, 24, 'blYard'),
  N('yd4', 0, 0, 12, 'blYard'), N('yd5', -11, 0, 12, 'blYard'), N('yd6', 10, 0, 12, 'blYard'),
  // 后花园 + B 洞上层楼梯
  N('gd1', -20, 0, 24, 'backGarden'), N('gd2', -28, 0, 24, 'backGarden'),
  N('gd3', -33, 0, 20, 'backGarden'), N('gd4', -20, 0, 11, 'backGarden'),
  N('gsb', -29, 0, 17, 'backGarden'), N('gsm', -29, 1.3, 12, 'bUpperStairs'),
  // B 洞上层 → B 窗
  N('ut1', -29, UPPER, 6, 'bTunnelUpper'), N('ut2', -29, UPPER, 0, 'bTunnelUpper'),
  N('ut3', -29, UPPER, -6, 'bTunnelUpper'), N('ut4', -29, UPPER, -11.5, 'bTunnelUpper'),
  N('wr1', -23, UPPER, -13, 'bWindow'), N('wr2', -23, UPPER, -18, 'bWindow'),
  N('wr3', -23, UPPER, -23, 'bWindow'), N('wr4', -23, UPPER, -27, 'bWindow'),
  // 桥下 → B 洞下层
  N('un1', -8, 0, 4, 'underpass'), N('un2', -14, 0, 4, 'underpass'),
  N('un3', -20, 0, 4, 'underpass'), N('un4', -26, 0, 4, 'underpass'),
  N('un5', -30, 0, 4, 'underpass'), N('un6', -35, 0, 4, 'bTunnelLower'),
  N('lo1', -35, 0, -2, 'bTunnelLower'), N('lo2', -35, 0, -8, 'bTunnelLower'),
  // B 区
  N('bs1', -35, 0, -13, 'bSite'), N('bs2', -30, 0, -19, 'bSite'), N('bs3', -36, 0, -23, 'bSite'),
  N('bs4', -41, 0, -16, 'bSite'), N('bs5', -30, 0, -28, 'bSite'), N('bs6', -39, 0, -30, 'bSite'),
  N('bs7', -32, 0, -32, 'bSite'),
  N('bd1', -24.5, 0, -32.9, 'bDoor'),     // B 门前地面走位（南侧避开 B窗楼梯）
  N('bc1', -20, 0, -33, 'bConnect'), N('bc2', -14, 0, -31, 'bConnect'), N('bc3', -23, 0, -34, 'bConnect'),
  N('gws1', -23, 1.3, -30, 'grStairs'), N('gws2', -23, UPPER, -27.6, 'grStairs'),
  // GR 出生与前庭
  N('gr1', -9, 0, -34, 'grSpawn'), N('gr2', 0, 0, -34, 'grSpawn'), N('gr3', 9, 0, -34, 'grSpawn'),
  N('gr4', -9, 0, -31.5, 'grSpawn'), N('gr5', 9, 0, -31.5, 'grSpawn'),
  N('gy1', 0, 0, -27, 'grYard'), N('gy2', -8, 0, -27, 'grYard'), N('gy3', 2, 0, -30.5, 'grYard'),
  N('md1', 0, 0, -22.8, 'midDoors'), N('md2', 0, 0, -25.2, 'midDoors'),
  // 中路
  N('mi1', 0, 0, -18, 'mid'), N('mi2', 0, 0, -10, 'mid'), N('mi3', 0, 0, -2, 'mid'), N('mi4', 0, 0, 4, 'mid'),
  // A 小道
  N('asx1', 8, 1.3, -17, 'aShortStairs'), N('asx2', 10.8, UPPER, -17, 'aShort'),
  N('as1', 16, UPPER, -17, 'aShort'), N('as2', 22, UPPER, -17, 'aShort'), N('as3', 25, UPPER, -17, 'aShort'),
  N('al1', 28, UPPER, -16, 'aLedge'), N('al2', 28, UPPER, -21, 'aLedge'),
  N('asG', 29, 0, -30, 'aSite'),
  // A 连接 / A 区
  N('ac1', 20, 0, -32, 'aConnect'), N('ac2', 23, 0, -32, 'aConnect'),
  N('sn1', 28, 0, -33, 'aSite'), N('snA', 33, 0, -27, 'aSite'), N('asE1', 33, 0, -18.5, 'aSite'),
  N('snB', 36, 0, -13.5, 'aSite'), N('sn3', 33, 0, -30, 'aSite'),
  N('asA1', 30, 0, -12, 'aSite'),
  N('plt0', 40, 0, -12, 'aSite'), N('plt1', 40, 1.3, -15.5, 'aSite'), N('plt2', 40, UPPER, -19.5, 'aPlatform'),
  N('pf1', 39, UPPER, -22, 'aPlatform'), N('pf2', 39, UPPER, -28, 'aPlatform'),
  N('pf3', 36, UPPER, -34, 'aPlatform'), N('pf4', 41, UPPER, -30, 'aPlatform'),
  // A 大入口 / A 大 / A 大坑 / A 门
  N('ae1', 14, 0, 30, 'aLongEnt'), N('ae2', 22, 0, 30, 'aLongEnt'),
  N('alg1', 28, 0, 26, 'aLong'), N('alg2', 28, 0, 18, 'aLong'), N('alg3', 30, 0, 15, 'aLong'),
  N('pr1', 30, -0.9, 8, 'aPit'), N('pb1', 30, PIT, 4, 'aPit'), N('pb2', 30, PIT, 0, 'aPit'),
  N('pr2', 30, -0.9, -4, 'aPit'), N('alg4', 30, 0, -7, 'aLong'),
  N('algL1', 24.9, 0, 12, 'aLong'), N('algL2', 24.9, 0, -4, 'aLong'),
  N('adS', 29, 0, -9.4, 'aDoor'), N('adN', 29, 0, -10.6, 'aSite'),
];

const E = (from, to, width = 2.5, requires = 'walk') => ({ from, to, bidirectional: true, width, requires });
const edges = [
  // BL 出生 ↔ 前院
  E('bl1', 'bl2'), E('bl2', 'bl3'), E('bl4', 'bl1'), E('bl5', 'bl3'), E('bl1', 'yd1'), E('bl2', 'yd2'), E('bl3', 'yd3'),
  E('yd1', 'yd2'), E('yd2', 'yd3'), E('yd1', 'yd5'), E('yd5', 'yd4'), E('yd2', 'yd4'), E('yd4', 'yd6'), E('yd6', 'yd3'),
  // 前院 ↔ 后花园 / A大入口 / 中路
  E('yd1', 'gd1'), E('yd4', 'gd4'), E('yd3', 'ae1', 3.5), E('yd6', 'ae1'),
  E('yd4', 'mi4', 4),
  // 后花园 ↔ B 洞上层楼梯
  E('gd1', 'gd2'), E('gd2', 'gd3'), E('gd3', 'gd4'), E('gd1', 'gd4'), E('gd2', 'gsb'), E('gsb', 'gsm', 4), E('gsm', 'ut1', 4),
  // B 洞上层 ↔ B 窗
  E('ut1', 'ut2'), E('ut2', 'ut3'), E('ut3', 'ut4'), E('ut4', 'wr1', 3),
  E('wr1', 'wr2'), E('wr2', 'wr3'), E('wr3', 'wr4'),
  // 桥下 ↔ B 洞下层 ↔ B 区
  E('mi4', 'un1', 4), E('un1', 'un2'), E('un2', 'un3'), E('un3', 'un4'), E('un4', 'un5'), E('un5', 'un6'),
  E('un6', 'lo1', 4), E('lo1', 'lo2'), E('lo2', 'bs1', 5),
  // B 区内部
  E('bs1', 'bs2'), E('bs1', 'bs4'), E('bs2', 'bs3'), E('bs3', 'bs4'), E('bs2', 'bs5'), E('bs5', 'bs6'), E('bs6', 'bs3'),
  E('bs1', 'bs6'), E('bs5', 'bs7'), E('bs6', 'bs7'),
  // B 门 / B 连接 / B 窗楼梯
  E('bs7', 'bd1', 2.5), E('bd1', 'bc1', 2.5), E('bc1', 'bc2'), E('bc2', 'bc3'), E('bc1', 'bc3'),
  E('bc3', 'gws1', 4), E('gws1', 'gws2', 4), E('gws2', 'wr4', 4),
  // GR 出生 ↔ 前庭 ↔ 两侧连接
  E('gr1', 'gr2'), E('gr2', 'gr3'), E('gr4', 'gr1'), E('gr5', 'gr3'), E('gr4', 'gr2'), E('gr5', 'gr2'),
  E('gr4', 'gy2'), E('gr2', 'gy1'), E('gr5', 'gy3'), E('gy2', 'gy1'), E('gy1', 'gy3'),
  E('gy2', 'bc2'), E('gy3', 'ac1'), E('gr5', 'ac1'),
  E('gy1', 'md2'), E('md1', 'md2', 1.5), E('md1', 'mi1'),
  // 中路
  E('mi1', 'mi2'), E('mi2', 'mi3'), E('mi3', 'mi4'),
  // A 小道楼梯 ↔ 小道 ↔ 下台 ↔ A 区
  E('mi1', 'asx1', 4), E('asx1', 'asx2', 4), E('asx2', 'as1'), E('as1', 'as2'), E('as2', 'as3'), E('as3', 'al1', 3.5),
  E('al1', 'al2'), E('al2', 'asG', 4),
  E('asG', 'snA'), E('asG', 'sn1'),
  // A 连接 ↔ A 区北侧
  E('ac1', 'ac2'), E('ac2', 'sn1', 4), E('sn1', 'sn3'), E('sn1', 'snA'), E('snA', 'sn3'), E('snA', 'asE1'),
  E('asE1', 'sn3'), E('asE1', 'snB'),
  // A 平台楼梯
  E('asA1', 'snB'), E('asA1', 'plt0', 4), E('snB', 'plt0', 4), E('plt0', 'plt1', 4), E('plt1', 'plt2', 4),
  E('plt2', 'pf1', 4), E('pf1', 'pf2'), E('pf2', 'pf4'), E('pf2', 'pf3'), E('pf4', 'pf3'),
  // A 大入口 ↔ A 大 ↔ 坑 ↔ A 门
  E('ae1', 'ae2'), E('ae2', 'alg1', 3.5), E('alg1', 'alg2'), E('alg2', 'alg3'), E('alg3', 'pr1', 4),
  E('pr1', 'pb1', 4), E('pb1', 'pb2'), E('pb2', 'pr2', 4), E('pr2', 'alg4', 4),
  E('alg2', 'algL1'), E('algL1', 'algL2'), E('algL2', 'alg4'),
  E('alg4', 'adS', 4), E('adS', 'adN', 4), E('adN', 'asA1'),
];

// 队伍目标节点：BL 目标 = 两个包点；GR 目标 = 防守/回防枢纽（A连接、中门北侧、B连接）
const teamGoals = {
  BL: ['pf2', 'bs3'],
  GR: ['ac2', 'md2', 'bc1'],
};

// ================== 地标观察机位（总览/逐地标截图与校验用） ==================
const V = (id, name, x, y, z, lx, ly, lz) => ({ id, name, position: { x, y, z }, lookAt: { x: lx, y: ly, z: lz } });
const landmarkViews = [
  V('overview', '总览', 0, 62, 66, 0, 0, -2),
  V('blSpawn', '潜伏者出生点', -2, 3.4, 35, 0, 1, 22),
  V('backGarden', '后花园', -24, 3.2, 31, -29, 2, 12),
  V('aLong', 'A大', 28, 3.2, 27, 30, 0.5, 4),
  V('aPit', 'A大坑', 25.5, 2.6, 14, 30, -1.6, 2),
  V('aDoor', 'A门', 29, 2.2, -6, 29, 1.5, -13),
  V('aPlatform', 'A平台', 30, 4.5, -14, 40, 3, -30),
  V('aRamp', 'A区斜坡', 40, 2.6, -9.5, 40, 2.2, -21),
  V('aShort', 'A小道', 13, 4.6, -13.5, 25, 3, -18),
  V('aShortStairs', 'A小道楼梯', 3.5, 2.6, -12.5, 9, 1.6, -17.5),
  V('mid', '中路', 0, 3.2, 6, 0, 1.5, -20),
  V('midDoors', '中门', 0, 2.6, -20, 0, 1.5, -26),
  V('underpass', '桥下', -8, 1.8, 4, -32, 1.5, 4),
  V('bTunnelUpper', 'B洞上层', -29, 4.4, 7, -29, 3, -12),
  V('bTunnelLower', 'B洞下层', -35, 1.8, 1, -35, 1.4, -10),
  V('bDoor', 'B门', -21, 2.2, -31.6, -28, 1.5, -32.6),
  V('bWindow', 'B窗', -23, 4.4, -15, -30, 1, -22),
  V('bSite', 'B区', -40, 3, -31, -28, 0.5, -16),
  V('grSpawn', '保卫者出生点', 2, 3.4, -31.5, 0, 1.2, -37),
  V('aSite', 'A区', 28, 4, -12, 38, 2.5, -30),
];

export const DESERT_LAYOUT = {
  meta: {
    id: 'desert-grey',
    orientation: '+X 东/A，-X 西/B，-Z 北/GR端，+Z 南/BL端；yaw=0 朝北',
    scaleNote: '约 88m × 76m，按参考俯视图与 1.75m 人物比例估算的白盒尺度，非精确原版尺寸',
    refs: ['https://ol.3dmgame.com/gl/15988.html'],
    levels: { ground: 0, upper: UPPER, pit: PIT },
  },
  bounds: { x0: -44, x1: 44, z0: -38, z1: 38 },
  spawns,
  regions,
  bombSites,
  navGraph: { nodes, edges },
  teamGoals,
  landmarkViews,
  solids,
  ramps,
};
