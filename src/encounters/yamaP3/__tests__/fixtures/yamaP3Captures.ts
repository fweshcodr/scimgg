/**
 * Facts extracted from private gameplay captures (yama-packet-data.txt, yama-normal-contract-long-p3-packet-data.txt, yama-normal-contract-203-magic-def-223-range-def-p3-packet-data.txt, yama-contract-of-divine-severance-packet-data-1.txt, yama_divine_severance.txt, yama_forfeit_breath.txt, yama-contract-of-glyphic-attenuation-packet-data-1.txt, yama-contract-of-glyphic-attenuation-packet-data-2.txt, yama-contract-of-bloodied-blows-packet-data-1.txt, yama-contract-of-sensory-clouding-packet-data-1(incomplete).txt, yama-contract-of-sensory-clouding-p3-contributed-packet-data(incomplete).txt, yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt, yama-contract-forfeit-breath-p3-voidflare-explosions-packet-data.txt, yama-contract-of-glyphic-attenuation-packet-data-p3-void-flare-explosions.txt).
 *
 * Yama phase 3, as the capture conformance suite reads it. Sim tick 0 is the `busy 1->0` after the
 * last `yama_transition_phase 1->0`, and sim tiles are world minus (1472, 10048).
 *
 * `YAMA_P3_CAPTURES` (one module per capture in `./yamaP3Capture/`) and `YAMA_FLARE_LIFECYCLES`,
 * which reads every Yama capture including two with no phase-3 control tick, and
 * `YAMA_SCORCHING_CASTS`, the scorching bow specials of the two sensory-clouding captures.
 */
import { CAPTURE as base } from './yamaP3Capture/base';
import { CAPTURE as baseKnownGear } from './yamaP3Capture/baseKnownGear';
import { CAPTURE as baseLong } from './yamaP3Capture/baseLong';
import { CAPTURE as bloodied } from './yamaP3Capture/bloodied';
import { CAPTURE as divine1 } from './yamaP3Capture/divine1';
import { CAPTURE as divine2 } from './yamaP3Capture/divine2';
import { CAPTURE as forfeit } from './yamaP3Capture/forfeit';
import { CAPTURE as glyphic1 } from './yamaP3Capture/glyphic1';
import { CAPTURE as glyphic2 } from './yamaP3Capture/glyphic2';
import { CAPTURE as sensory1 } from './yamaP3Capture/sensory1';
import { CAPTURE as sensory2 } from './yamaP3Capture/sensory2';

type Coordinate = readonly [number, number];
type Transition = { readonly tick: number; readonly from: number; readonly to: number };

export interface CapturedYamaP3 {
  /** Capture tick phase 3 handed control back; every sim tick below is relative to it. */
  readonly controlTick: number;
  /** `hpbar_hud_hp` on or after the control tick, and the `hpbar_hud_basehp` maximum. */
  readonly bossHpAtP3: number;
  readonly bossMaxHp: number;
  /** Sim ticks carrying a `vfx_npc_yama_magic_*` cast. */
  readonly castTicks: readonly number[];
  /** Each phase-3 cast with the style it used, in order (shadow is the ranged attack). */
  readonly castStyles: readonly { readonly tick: number; readonly style: 'magic' | 'range' }[];
  /** Sim ticks Yama's own block carries an `npc_yama01_melee01` swing. */
  readonly meleeTicks: readonly number[];
  /**
   * Shadow wall map_anims (`vfx_shadow_wall_02` is arm R, along x+y; `_03` arm L, along y-x), one
   * row per emission tick, dangerous tick and arm, with its tiles flattened as `[x0, y0, x1, y1, ...]`.
   * The dangerous tick is emission + floor(delay / 30).
   */
  readonly wallBatches: readonly (readonly [emit: number, danger: number, arm: 'L' | 'R', tiles: readonly number[]])[];
  /** Sim tick -> how many flares were added on it. */
  readonly flareSpawns: readonly (readonly [tick: number, count: number])[];
  /** Every phase-3 spawn event in order: the sim tick, and the corners it filled. */
  readonly flareSpawnOrder: readonly { readonly tick: number; readonly positions: readonly Coordinate[] }[];
  /** Flares the player killed (not exploded), with the total damage that did it. */
  readonly flareKills: readonly {
    readonly spawn: number;
    readonly spawnedTogether: number;
    readonly totalDamage: number;
  }[];
  /**
   * Yama's auto-attacks as they landed on the player (cast + 3), on ticks with a single hitsplat:
   * ticks since the last protection click, damage, style, whether the matching overhead was up on
   * the landing tick, and Yama's health on the cast tick.
   */
  readonly autoAttackLandings: readonly {
    readonly tick: number;
    readonly sinceProtectionClick: number | null;
    readonly damage: number;
    readonly style: 'magic' | 'range';
    readonly protectedByOverhead: boolean;
    readonly bossHpAtLaunch: number;
  }[];
  /** Ticks from each protection prayer's `0->1` to its `1->0`. */
  readonly prayerVarbitSpans: readonly number[];
  /** Sim tick -> Yama's SW corner, and the player's tile, at the end of that tick. */
  readonly yamaPositions: readonly (readonly [tick: number, tile: Coordinate])[];
  readonly playerPositions: readonly (readonly [tick: number, tile: Coordinate])[];
  /** Sim ticks the player fired the scorching bow's special on. */
  readonly scorchingSpecTicks: readonly number[];
  /** Capture-tick transitions of `sa_energy` (varp 300, tenths of a percent) and the death charge varbits 12411/12138. */
  readonly specEnergy: readonly Transition[];
  readonly deathChargeActive: readonly Transition[];
  readonly deathChargeCooldown: readonly Transition[];
}

export const YAMA_P3_CAPTURES: Readonly<Record<string, CapturedYamaP3>> = {
  'yama-packet-data.txt': base,
  'yama-normal-contract-long-p3-packet-data.txt': baseLong,
  'yama-normal-contract-203-magic-def-223-range-def-p3-packet-data.txt': baseKnownGear,
  'yama-contract-of-divine-severance-packet-data-1.txt': divine1,
  'yama_divine_severance.txt': divine2,
  'yama_forfeit_breath.txt': forfeit,
  'yama-contract-of-glyphic-attenuation-packet-data-1.txt': glyphic1,
  'yama-contract-of-glyphic-attenuation-packet-data-2.txt': glyphic2,
  'yama-contract-of-bloodied-blows-packet-data-1.txt': bloodied,
  'yama-contract-of-sensory-clouding-packet-data-1(incomplete).txt': sensory1,
  'yama-contract-of-sensory-clouding-p3-contributed-packet-data(incomplete).txt': sensory2,
};

/**
 * Each void flare (npc 14179) from its `add`, in capture ticks: its first hitpoints headbar (id 2),
 * its first fuse headbar (id 75) with the fuse `endtime` in client cycles, its explode sequence, when
 * it stopped being live (death sequence, `del` or the end of the capture) and the player's first
 * `opnpc` on it.
 */
export interface FlareLifecycle {
  readonly capture: string;
  readonly index: string;
  readonly add: number;
  readonly hpBar: number | null;
  readonly fuseBar: { readonly tick: number; readonly endTime: number } | null;
  readonly explode: number | null;
  readonly end: number;
  readonly firstOp: number | null;
}

// biome-ignore format: one extracted record per line keeps the fixture reviewable
export const YAMA_FLARE_LIFECYCLES: readonly FlareLifecycle[] = [
  {"capture":"yama-packet-data.txt","index":"61340","add":424,"hpBar":427,"fuseBar":{"tick":427,"endTime":630},"explode":null,"end":439,"firstOp":431},
  {"capture":"yama-packet-data.txt","index":"61341","add":424,"hpBar":427,"fuseBar":{"tick":427,"endTime":630},"explode":null,"end":447,"firstOp":437},
  {"capture":"yama-packet-data.txt","index":"33334","add":640,"hpBar":643,"fuseBar":{"tick":643,"endTime":630},"explode":null,"end":662,"firstOp":652},
  {"capture":"yama-packet-data.txt","index":"33333","add":640,"hpBar":643,"fuseBar":{"tick":643,"endTime":630},"explode":null,"end":654,"firstOp":644},
  {"capture":"yama-packet-data.txt","index":"38681","add":871,"hpBar":874,"fuseBar":{"tick":874,"endTime":600},"explode":null,"end":887,"firstOp":882},
  {"capture":"yama-packet-data.txt","index":"38682","add":871,"hpBar":874,"fuseBar":{"tick":874,"endTime":600},"explode":null,"end":883,"firstOp":880},
  {"capture":"yama-packet-data.txt","index":"39237","add":899,"hpBar":902,"fuseBar":{"tick":902,"endTime":360},"explode":null,"end":908,"firstOp":904},
  {"capture":"yama-packet-data.txt","index":"40143","add":941,"hpBar":944,"fuseBar":{"tick":944,"endTime":600},"explode":null,"end":949,"firstOp":945},
  {"capture":"yama-packet-data.txt","index":"40144","add":941,"hpBar":944,"fuseBar":{"tick":944,"endTime":600},"explode":null,"end":952,"firstOp":948},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"58874","add":601,"hpBar":604,"fuseBar":{"tick":604,"endTime":600},"explode":null,"end":613,"firstOp":609},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"59123","add":621,"hpBar":624,"fuseBar":{"tick":624,"endTime":600},"explode":null,"end":636,"firstOp":631},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"59275","add":638,"hpBar":641,"fuseBar":{"tick":641,"endTime":630},"explode":null,"end":656,"firstOp":642},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"59274","add":638,"hpBar":641,"fuseBar":{"tick":641,"endTime":630},"explode":664,"end":666,"firstOp":null},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"59298","add":641,"hpBar":644,"fuseBar":{"tick":644,"endTime":600},"explode":null,"end":651,"firstOp":647},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"59526","add":661,"hpBar":664,"fuseBar":{"tick":664,"endTime":600},"explode":null,"end":672,"firstOp":665},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"59814","add":681,"hpBar":684,"fuseBar":{"tick":684,"endTime":600},"explode":null,"end":690,"firstOp":686},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"59994","add":701,"hpBar":704,"fuseBar":{"tick":704,"endTime":600},"explode":null,"end":714,"firstOp":709},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"60143","add":721,"hpBar":724,"fuseBar":{"tick":724,"endTime":600},"explode":null,"end":733,"firstOp":729},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"60385","add":741,"hpBar":744,"fuseBar":{"tick":744,"endTime":600},"explode":null,"end":752,"firstOp":748},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"60493","add":757,"hpBar":760,"fuseBar":{"tick":760,"endTime":630},"explode":null,"end":773,"firstOp":763},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"60492","add":757,"hpBar":760,"fuseBar":{"tick":760,"endTime":630},"explode":783,"end":785,"firstOp":null},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"60535","add":761,"hpBar":764,"fuseBar":{"tick":764,"endTime":600},"explode":null,"end":778,"firstOp":774},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"60707","add":781,"hpBar":784,"fuseBar":{"tick":784,"endTime":600},"explode":null,"end":793,"firstOp":788},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"61356","add":861,"hpBar":864,"fuseBar":{"tick":864,"endTime":600},"explode":null,"end":875,"firstOp":871},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"61602","add":881,"hpBar":884,"fuseBar":{"tick":884,"endTime":600},"explode":null,"end":893,"firstOp":888},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"61775","add":901,"hpBar":904,"fuseBar":{"tick":904,"endTime":600},"explode":null,"end":925,"firstOp":921},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"61956","add":921,"hpBar":924,"fuseBar":{"tick":924,"endTime":600},"explode":null,"end":932,"firstOp":928},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"62146","add":939,"hpBar":942,"fuseBar":{"tick":942,"endTime":630},"explode":965,"end":967,"firstOp":null},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"62145","add":939,"hpBar":942,"fuseBar":{"tick":942,"endTime":630},"explode":null,"end":958,"firstOp":949},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"62160","add":941,"hpBar":944,"fuseBar":{"tick":944,"endTime":600},"explode":966,"end":968,"firstOp":null},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"62337","add":961,"hpBar":964,"fuseBar":{"tick":964,"endTime":600},"explode":null,"end":971,"firstOp":966},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"62530","add":981,"hpBar":984,"fuseBar":{"tick":984,"endTime":600},"explode":null,"end":989,"firstOp":985},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"62733","add":1001,"hpBar":1004,"fuseBar":{"tick":1004,"endTime":600},"explode":null,"end":1009,"firstOp":1005},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"62941","add":1021,"hpBar":null,"fuseBar":null,"explode":null,"end":1021,"firstOp":null},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"63713","add":1101,"hpBar":1104,"fuseBar":{"tick":1104,"endTime":600},"explode":null,"end":1111,"firstOp":1107},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"63885","add":1121,"hpBar":1124,"fuseBar":{"tick":1124,"endTime":600},"explode":null,"end":1133,"firstOp":1129},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"64109","add":1141,"hpBar":1144,"fuseBar":{"tick":1144,"endTime":600},"explode":null,"end":1152,"firstOp":1148},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"64136","add":1144,"hpBar":1147,"fuseBar":{"tick":1147,"endTime":600},"explode":null,"end":1159,"firstOp":1155},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"64137","add":1144,"hpBar":1147,"fuseBar":{"tick":1147,"endTime":600},"explode":null,"end":1155,"firstOp":1151},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"64294","add":1161,"hpBar":1164,"fuseBar":{"tick":1164,"endTime":600},"explode":null,"end":1175,"firstOp":1171},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"64485","add":1181,"hpBar":1184,"fuseBar":{"tick":1184,"endTime":600},"explode":null,"end":1195,"firstOp":1191},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"64662","add":1201,"hpBar":1204,"fuseBar":{"tick":1204,"endTime":600},"explode":null,"end":1211,"firstOp":1207},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"64801","add":1214,"hpBar":1217,"fuseBar":{"tick":1217,"endTime":600},"explode":null,"end":1229,"firstOp":1225},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"64800","add":1214,"hpBar":1217,"fuseBar":{"tick":1217,"endTime":600},"explode":null,"end":1225,"firstOp":1220},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"64848","add":1221,"hpBar":1224,"fuseBar":{"tick":1224,"endTime":600},"explode":null,"end":1232,"firstOp":1227},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"65039","add":1241,"hpBar":1244,"fuseBar":{"tick":1244,"endTime":600},"explode":null,"end":1255,"firstOp":1251},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"65223","add":1261,"hpBar":1264,"fuseBar":{"tick":1264,"endTime":600},"explode":null,"end":1269,"firstOp":1265},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"65383","add":1281,"hpBar":1284,"fuseBar":{"tick":1284,"endTime":600},"explode":null,"end":1294,"firstOp":1290},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"65395","add":1284,"hpBar":1287,"fuseBar":{"tick":1287,"endTime":600},"explode":null,"end":1297,"firstOp":1293},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"65396","add":1284,"hpBar":1287,"fuseBar":{"tick":1287,"endTime":600},"explode":null,"end":1300,"firstOp":1296},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"33024","add":1301,"hpBar":1304,"fuseBar":{"tick":1304,"endTime":600},"explode":null,"end":1313,"firstOp":1309},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"33190","add":1321,"hpBar":1324,"fuseBar":{"tick":1324,"endTime":600},"explode":null,"end":1331,"firstOp":1326},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"33396","add":1341,"hpBar":1344,"fuseBar":{"tick":1344,"endTime":600},"explode":null,"end":1351,"firstOp":1347},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"33541","add":1354,"hpBar":1357,"fuseBar":{"tick":1357,"endTime":600},"explode":null,"end":1359,"firstOp":null},
  {"capture":"yama-contract-of-divine-severance-packet-data-1.txt","index":"33542","add":1354,"hpBar":1357,"fuseBar":{"tick":1357,"endTime":600},"explode":null,"end":1359,"firstOp":null},
  {"capture":"yama_divine_severance.txt","index":"49039","add":3205,"hpBar":3208,"fuseBar":{"tick":3208,"endTime":600},"explode":null,"end":3215,"firstOp":3210},
  {"capture":"yama_divine_severance.txt","index":"49556","add":3225,"hpBar":3228,"fuseBar":{"tick":3228,"endTime":600},"explode":null,"end":3235,"firstOp":3232},
  {"capture":"yama_divine_severance.txt","index":"50113","add":3245,"hpBar":3248,"fuseBar":{"tick":3248,"endTime":600},"explode":null,"end":3254,"firstOp":3249},
  {"capture":"yama_divine_severance.txt","index":"50686","add":3264,"hpBar":3267,"fuseBar":{"tick":3267,"endTime":630},"explode":3290,"end":3292,"firstOp":3281},
  {"capture":"yama_divine_severance.txt","index":"50688","add":3264,"hpBar":3267,"fuseBar":{"tick":3267,"endTime":630},"explode":3290,"end":3292,"firstOp":3269},
  {"capture":"yama_divine_severance.txt","index":"50772","add":3265,"hpBar":3268,"fuseBar":{"tick":3268,"endTime":600},"explode":null,"end":3279,"firstOp":3273},
  {"capture":"yama_divine_severance.txt","index":"51177","add":3285,"hpBar":3288,"fuseBar":{"tick":3288,"endTime":600},"explode":null,"end":3293,"firstOp":3290},
  {"capture":"yama_divine_severance.txt","index":"51613","add":3305,"hpBar":3308,"fuseBar":{"tick":3308,"endTime":600},"explode":null,"end":3316,"firstOp":3312},
  {"capture":"yama_divine_severance.txt","index":"52004","add":3325,"hpBar":3328,"fuseBar":{"tick":3328,"endTime":600},"explode":null,"end":3334,"firstOp":3331},
  {"capture":"yama_divine_severance.txt","index":"52434","add":3345,"hpBar":3348,"fuseBar":{"tick":3348,"endTime":600},"explode":null,"end":3359,"firstOp":3352},
  {"capture":"yama_divine_severance.txt","index":"52790","add":3365,"hpBar":3368,"fuseBar":{"tick":3368,"endTime":600},"explode":null,"end":3373,"firstOp":3370},
  {"capture":"yama_divine_severance.txt","index":"54438","add":3445,"hpBar":3448,"fuseBar":{"tick":3448,"endTime":600},"explode":null,"end":3453,"firstOp":3449},
  {"capture":"yama_divine_severance.txt","index":"54933","add":3465,"hpBar":3468,"fuseBar":{"tick":3468,"endTime":600},"explode":null,"end":3478,"firstOp":3472},
  {"capture":"yama_divine_severance.txt","index":"55387","add":3485,"hpBar":3488,"fuseBar":{"tick":3488,"endTime":600},"explode":null,"end":3496,"firstOp":3490},
  {"capture":"yama_divine_severance.txt","index":"55776","add":3505,"hpBar":3508,"fuseBar":{"tick":3508,"endTime":600},"explode":null,"end":3515,"firstOp":3512},
  {"capture":"yama_divine_severance.txt","index":"56030","add":3522,"hpBar":3525,"fuseBar":{"tick":3525,"endTime":630},"explode":3548,"end":3550,"firstOp":null},
  {"capture":"yama_divine_severance.txt","index":"56031","add":3522,"hpBar":3525,"fuseBar":{"tick":3525,"endTime":630},"explode":null,"end":3539,"firstOp":3526},
  {"capture":"yama_divine_severance.txt","index":"56104","add":3525,"hpBar":3528,"fuseBar":{"tick":3528,"endTime":600},"explode":null,"end":3535,"firstOp":3531},
  {"capture":"yama_divine_severance.txt","index":"56690","add":3545,"hpBar":3548,"fuseBar":{"tick":3548,"endTime":600},"explode":null,"end":3555,"firstOp":3551},
  {"capture":"yama_divine_severance.txt","index":"57161","add":3565,"hpBar":3568,"fuseBar":{"tick":3568,"endTime":600},"explode":null,"end":3577,"firstOp":3573},
  {"capture":"yama_divine_severance.txt","index":"57505","add":3585,"hpBar":3588,"fuseBar":{"tick":3588,"endTime":600},"explode":null,"end":3595,"firstOp":3592},
  {"capture":"yama_divine_severance.txt","index":"58998","add":3665,"hpBar":3668,"fuseBar":{"tick":3668,"endTime":600},"explode":null,"end":3674,"firstOp":3670},
  {"capture":"yama_divine_severance.txt","index":"59522","add":3685,"hpBar":3688,"fuseBar":{"tick":3688,"endTime":600},"explode":null,"end":3696,"firstOp":3691},
  {"capture":"yama_divine_severance.txt","index":"59969","add":3705,"hpBar":3708,"fuseBar":{"tick":3708,"endTime":600},"explode":null,"end":3718,"firstOp":3713},
  {"capture":"yama_divine_severance.txt","index":"60141","add":3714,"hpBar":3717,"fuseBar":{"tick":3717,"endTime":600},"explode":null,"end":3727,"firstOp":3722},
  {"capture":"yama_divine_severance.txt","index":"60142","add":3714,"hpBar":3717,"fuseBar":{"tick":3717,"endTime":600},"explode":null,"end":3723,"firstOp":3719},
  {"capture":"yama_divine_severance.txt","index":"60437","add":3725,"hpBar":3728,"fuseBar":{"tick":3728,"endTime":600},"explode":null,"end":3733,"firstOp":3730},
  {"capture":"yama_divine_severance.txt","index":"61006","add":3745,"hpBar":3748,"fuseBar":{"tick":3748,"endTime":600},"explode":null,"end":3753,"firstOp":3749},
  {"capture":"yama_divine_severance.txt","index":"61447","add":3765,"hpBar":3768,"fuseBar":{"tick":3768,"endTime":600},"explode":null,"end":3780,"firstOp":3776},
  {"capture":"yama_divine_severance.txt","index":"61840","add":3784,"hpBar":3787,"fuseBar":{"tick":3787,"endTime":600},"explode":null,"end":3799,"firstOp":3795},
  {"capture":"yama_divine_severance.txt","index":"61839","add":3784,"hpBar":3787,"fuseBar":{"tick":3787,"endTime":600},"explode":null,"end":3797,"firstOp":3792},
  {"capture":"yama_divine_severance.txt","index":"61859","add":3785,"hpBar":3788,"fuseBar":{"tick":3788,"endTime":600},"explode":null,"end":3793,"firstOp":3789},
  {"capture":"yama_divine_severance.txt","index":"62275","add":3805,"hpBar":3808,"fuseBar":{"tick":3808,"endTime":600},"explode":null,"end":3818,"firstOp":3812},
  {"capture":"yama_divine_severance.txt","index":"62889","add":3825,"hpBar":3828,"fuseBar":{"tick":3828,"endTime":600},"explode":null,"end":3836,"firstOp":3832},
  {"capture":"yama_forfeit_breath.txt","index":"46019","add":172,"hpBar":175,"fuseBar":{"tick":175,"endTime":630},"explode":null,"end":188,"firstOp":179},
  {"capture":"yama_forfeit_breath.txt","index":"46020","add":172,"hpBar":175,"fuseBar":{"tick":175,"endTime":630},"explode":198,"end":200,"firstOp":187},
  {"capture":"yama_forfeit_breath.txt","index":"47663","add":277,"hpBar":280,"fuseBar":{"tick":280,"endTime":630},"explode":null,"end":289,"firstOp":null},
  {"capture":"yama_forfeit_breath.txt","index":"47662","add":277,"hpBar":280,"fuseBar":{"tick":280,"endTime":630},"explode":null,"end":289,"firstOp":283},
  {"capture":"yama_forfeit_breath.txt","index":"49700","add":423,"hpBar":426,"fuseBar":{"tick":426,"endTime":630},"explode":null,"end":435,"firstOp":427},
  {"capture":"yama_forfeit_breath.txt","index":"49701","add":423,"hpBar":426,"fuseBar":{"tick":426,"endTime":630},"explode":null,"end":446,"firstOp":434},
  {"capture":"yama_forfeit_breath.txt","index":"53052","add":655,"hpBar":658,"fuseBar":{"tick":658,"endTime":600},"explode":null,"end":664,"firstOp":660},
  {"capture":"yama_forfeit_breath.txt","index":"53051","add":655,"hpBar":658,"fuseBar":{"tick":658,"endTime":600},"explode":null,"end":667,"firstOp":663},
  {"capture":"yama_forfeit_breath.txt","index":"54007","add":725,"hpBar":728,"fuseBar":{"tick":728,"endTime":600},"explode":null,"end":740,"firstOp":735},
  {"capture":"yama_forfeit_breath.txt","index":"54008","add":725,"hpBar":728,"fuseBar":{"tick":728,"endTime":600},"explode":null,"end":736,"firstOp":731},
  {"capture":"yama_forfeit_breath.txt","index":"54877","add":795,"hpBar":798,"fuseBar":{"tick":798,"endTime":600},"explode":null,"end":817,"firstOp":803},
  {"capture":"yama_forfeit_breath.txt","index":"54876","add":795,"hpBar":798,"fuseBar":{"tick":798,"endTime":600},"explode":null,"end":814,"firstOp":809},
  {"capture":"yama_forfeit_breath.txt","index":"55884","add":865,"hpBar":868,"fuseBar":{"tick":868,"endTime":600},"explode":null,"end":880,"firstOp":876},
  {"capture":"yama_forfeit_breath.txt","index":"55885","add":865,"hpBar":868,"fuseBar":{"tick":868,"endTime":600},"explode":null,"end":877,"firstOp":872},
  {"capture":"yama-contract-of-bloodied-blows-packet-data-1.txt","index":"59146","add":2215,"hpBar":2218,"fuseBar":{"tick":2218,"endTime":750},"explode":null,"end":2220,"firstOp":null},
  {"capture":"yama-contract-of-bloodied-blows-packet-data-1.txt","index":"59145","add":2215,"hpBar":2218,"fuseBar":{"tick":2218,"endTime":750},"explode":null,"end":2220,"firstOp":null},
  {"capture":"yama-contract-of-bloodied-blows-packet-data-1.txt","index":"59147","add":2215,"hpBar":2218,"fuseBar":{"tick":2218,"endTime":750},"explode":null,"end":2220,"firstOp":null},
  {"capture":"yama-contract-of-bloodied-blows-packet-data-1.txt","index":"59148","add":2215,"hpBar":2218,"fuseBar":{"tick":2218,"endTime":750},"explode":null,"end":2220,"firstOp":null},
  {"capture":"yama-contract-of-bloodied-blows-packet-data-1.txt","index":"33634","add":2452,"hpBar":2455,"fuseBar":{"tick":2455,"endTime":600},"explode":null,"end":2467,"firstOp":2463},
  {"capture":"yama-contract-of-bloodied-blows-packet-data-1.txt","index":"33633","add":2452,"hpBar":2455,"fuseBar":{"tick":2455,"endTime":600},"explode":null,"end":2464,"firstOp":2459},
  {"capture":"yama-contract-of-bloodied-blows-packet-data-1.txt","index":"34686","add":2487,"hpBar":2490,"fuseBar":{"tick":2490,"endTime":600},"explode":null,"end":2497,"firstOp":2493},
  {"capture":"yama-contract-of-bloodied-blows-packet-data-1.txt","index":"34687","add":2487,"hpBar":2490,"fuseBar":{"tick":2490,"endTime":600},"explode":null,"end":2500,"firstOp":2495},
  {"capture":"yama-contract-of-bloodied-blows-packet-data-1.txt","index":"35711","add":2522,"hpBar":2525,"fuseBar":{"tick":2525,"endTime":600},"explode":null,"end":2537,"firstOp":2533},
  {"capture":"yama-contract-of-bloodied-blows-packet-data-1.txt","index":"35710","add":2522,"hpBar":2525,"fuseBar":{"tick":2525,"endTime":600},"explode":null,"end":2533,"firstOp":2529},
  {"capture":"yama-contract-of-bloodied-blows-packet-data-1.txt","index":"36834","add":2557,"hpBar":2560,"fuseBar":{"tick":2560,"endTime":600},"explode":null,"end":2566,"firstOp":2562},
  {"capture":"yama-contract-of-bloodied-blows-packet-data-1.txt","index":"36835","add":2557,"hpBar":2560,"fuseBar":{"tick":2560,"endTime":600},"explode":null,"end":2569,"firstOp":2565},
  {"capture":"yama-contract-of-sensory-clouding-packet-data-1(incomplete).txt","index":"35442","add":8444,"hpBar":8447,"fuseBar":{"tick":8447,"endTime":630},"explode":null,"end":8465,"firstOp":8453},
  {"capture":"yama-contract-of-sensory-clouding-packet-data-1(incomplete).txt","index":"35443","add":8444,"hpBar":8447,"fuseBar":{"tick":8447,"endTime":630},"explode":8470,"end":8472,"firstOp":null},
  {"capture":"yama-contract-of-sensory-clouding-packet-data-1(incomplete).txt","index":"44036","add":8667,"hpBar":8670,"fuseBar":{"tick":8670,"endTime":630},"explode":null,"end":8684,"firstOp":8674},
  {"capture":"yama-contract-of-sensory-clouding-packet-data-1(incomplete).txt","index":"44035","add":8667,"hpBar":8670,"fuseBar":{"tick":8670,"endTime":630},"explode":8693,"end":8695,"firstOp":null},
  {"capture":"yama-contract-of-sensory-clouding-packet-data-1(incomplete).txt","index":"52730","add":8900,"hpBar":8903,"fuseBar":{"tick":8903,"endTime":600},"explode":null,"end":8916,"firstOp":8911},
  {"capture":"yama-contract-of-sensory-clouding-packet-data-1(incomplete).txt","index":"52731","add":8900,"hpBar":8903,"fuseBar":{"tick":8903,"endTime":600},"explode":null,"end":8912,"firstOp":8905},
  {"capture":"yama-contract-of-sensory-clouding-packet-data-1(incomplete).txt","index":"55097","add":8970,"hpBar":8973,"fuseBar":{"tick":8973,"endTime":600},"explode":null,"end":8987,"firstOp":8983},
  {"capture":"yama-contract-of-sensory-clouding-packet-data-1(incomplete).txt","index":"55096","add":8970,"hpBar":8973,"fuseBar":{"tick":8973,"endTime":600},"explode":null,"end":8990,"firstOp":8986},
  {"capture":"yama-contract-of-sensory-clouding-packet-data-1(incomplete).txt","index":"57776","add":9040,"hpBar":9043,"fuseBar":{"tick":9043,"endTime":600},"explode":null,"end":9058,"firstOp":9052},
  {"capture":"yama-contract-of-sensory-clouding-packet-data-1(incomplete).txt","index":"57777","add":9040,"hpBar":9043,"fuseBar":{"tick":9043,"endTime":600},"explode":null,"end":9053,"firstOp":9049},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-1.txt","index":"64727","add":16362,"hpBar":16365,"fuseBar":{"tick":16365,"endTime":630},"explode":null,"end":16381,"firstOp":16372},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-1.txt","index":"64728","add":16362,"hpBar":16365,"fuseBar":{"tick":16365,"endTime":630},"explode":16388,"end":16390,"firstOp":null},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-1.txt","index":"33870","add":16467,"hpBar":16470,"fuseBar":{"tick":16470,"endTime":630},"explode":null,"end":16490,"firstOp":16480},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-1.txt","index":"33871","add":16467,"hpBar":16470,"fuseBar":{"tick":16470,"endTime":630},"explode":null,"end":16481,"firstOp":16472},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-1.txt","index":"35589","add":16572,"hpBar":16575,"fuseBar":{"tick":16575,"endTime":630},"explode":null,"end":16595,"firstOp":16586},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-1.txt","index":"35590","add":16572,"hpBar":16575,"fuseBar":{"tick":16575,"endTime":630},"explode":null,"end":16585,"firstOp":16576},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-1.txt","index":"40351","add":16860,"hpBar":16863,"fuseBar":{"tick":16863,"endTime":630},"explode":null,"end":16874,"firstOp":16865},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-1.txt","index":"40350","add":16860,"hpBar":16863,"fuseBar":{"tick":16863,"endTime":630},"explode":null,"end":16882,"firstOp":16872},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-1.txt","index":"42339","add":16965,"hpBar":16968,"fuseBar":{"tick":16968,"endTime":630},"explode":16991,"end":16993,"firstOp":16983},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-1.txt","index":"42338","add":16965,"hpBar":16968,"fuseBar":{"tick":16968,"endTime":630},"explode":null,"end":16981,"firstOp":16971},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-1.txt","index":"44083","add":17070,"hpBar":17073,"fuseBar":{"tick":17073,"endTime":630},"explode":null,"end":17075,"firstOp":null},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-1.txt","index":"44082","add":17070,"hpBar":17073,"fuseBar":{"tick":17073,"endTime":630},"explode":null,"end":17075,"firstOp":null},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-1.txt","index":"46435","add":17245,"hpBar":17248,"fuseBar":{"tick":17248,"endTime":630},"explode":null,"end":17270,"firstOp":17261},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-1.txt","index":"46434","add":17245,"hpBar":17248,"fuseBar":{"tick":17248,"endTime":630},"explode":null,"end":17261,"firstOp":17252},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-1.txt","index":"47928","add":17350,"hpBar":17353,"fuseBar":{"tick":17353,"endTime":630},"explode":null,"end":17363,"firstOp":17354},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-1.txt","index":"47927","add":17350,"hpBar":17353,"fuseBar":{"tick":17353,"endTime":630},"explode":null,"end":17372,"firstOp":17363},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-1.txt","index":"50985","add":17575,"hpBar":17578,"fuseBar":{"tick":17578,"endTime":600},"explode":null,"end":17587,"firstOp":17583},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-1.txt","index":"50984","add":17575,"hpBar":17578,"fuseBar":{"tick":17578,"endTime":600},"explode":null,"end":17590,"firstOp":17585},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-2.txt","index":"62859","add":18422,"hpBar":18425,"fuseBar":{"tick":18425,"endTime":630},"explode":null,"end":18436,"firstOp":18426},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-2.txt","index":"62858","add":18422,"hpBar":18425,"fuseBar":{"tick":18425,"endTime":630},"explode":null,"end":18446,"firstOp":18436},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-2.txt","index":"34535","add":18707,"hpBar":18710,"fuseBar":{"tick":18710,"endTime":630},"explode":null,"end":18722,"firstOp":18713},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-2.txt","index":"34536","add":18707,"hpBar":18710,"fuseBar":{"tick":18710,"endTime":630},"explode":null,"end":18732,"firstOp":18723},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-2.txt","index":"36359","add":18812,"hpBar":18815,"fuseBar":{"tick":18815,"endTime":630},"explode":null,"end":18831,"firstOp":18818},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-2.txt","index":"36358","add":18812,"hpBar":18815,"fuseBar":{"tick":18815,"endTime":630},"explode":18838,"end":18840,"firstOp":18829},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-2.txt","index":"39215","add":18998,"hpBar":19001,"fuseBar":{"tick":19001,"endTime":630},"explode":null,"end":19020,"firstOp":19011},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-2.txt","index":"39216","add":18998,"hpBar":19001,"fuseBar":{"tick":19001,"endTime":630},"explode":null,"end":19012,"firstOp":19003},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-2.txt","index":"41897","add":19177,"hpBar":19180,"fuseBar":{"tick":19180,"endTime":360},"explode":null,"end":19189,"firstOp":19185},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-2.txt","index":"42383","add":19205,"hpBar":19208,"fuseBar":{"tick":19208,"endTime":600},"explode":null,"end":19213,"firstOp":19209},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-2.txt","index":"42384","add":19205,"hpBar":19208,"fuseBar":{"tick":19208,"endTime":600},"explode":null,"end":19215,"firstOp":19212},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-2.txt","index":"43212","add":19275,"hpBar":19278,"fuseBar":{"tick":19278,"endTime":600},"explode":null,"end":19287,"firstOp":19283},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-2.txt","index":"43211","add":19275,"hpBar":19278,"fuseBar":{"tick":19278,"endTime":600},"explode":null,"end":19290,"firstOp":19285},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-2.txt","index":"44066","add":19345,"hpBar":19348,"fuseBar":{"tick":19348,"endTime":600},"explode":null,"end":19356,"firstOp":19352},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-2.txt","index":"44067","add":19345,"hpBar":19348,"fuseBar":{"tick":19348,"endTime":600},"explode":null,"end":19359,"firstOp":19355},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-2.txt","index":"45024","add":19415,"hpBar":19418,"fuseBar":{"tick":19418,"endTime":600},"explode":null,"end":19435,"firstOp":19430},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-2.txt","index":"45023","add":19415,"hpBar":19418,"fuseBar":{"tick":19418,"endTime":600},"explode":null,"end":19432,"firstOp":19428},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-2.txt","index":"46113","add":19485,"hpBar":19488,"fuseBar":{"tick":19488,"endTime":600},"explode":null,"end":19492,"firstOp":19489},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-2.txt","index":"46114","add":19485,"hpBar":19488,"fuseBar":{"tick":19488,"endTime":600},"explode":null,"end":19495,"firstOp":19492},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-2.txt","index":"47003","add":19555,"hpBar":19558,"fuseBar":{"tick":19558,"endTime":600},"explode":null,"end":19570,"firstOp":19566},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-2.txt","index":"47002","add":19555,"hpBar":19558,"fuseBar":{"tick":19558,"endTime":600},"explode":null,"end":19565,"firstOp":19561},
  {"capture":"yama-contract-of-sensory-clouding-p3-contributed-packet-data(incomplete).txt","index":"55256","add":1603,"hpBar":1606,"fuseBar":{"tick":1606,"endTime":600},"explode":null,"end":1613,"firstOp":1608},
  {"capture":"yama-contract-of-sensory-clouding-p3-contributed-packet-data(incomplete).txt","index":"55255","add":1603,"hpBar":1606,"fuseBar":{"tick":1606,"endTime":600},"explode":null,"end":1615,"firstOp":1612},
  {"capture":"yama-contract-of-sensory-clouding-p3-contributed-packet-data(incomplete).txt","index":"56029","add":1673,"hpBar":1676,"fuseBar":{"tick":1676,"endTime":600},"explode":null,"end":1683,"firstOp":null},
  {"capture":"yama-contract-of-sensory-clouding-p3-contributed-packet-data(incomplete).txt","index":"56030","add":1673,"hpBar":1676,"fuseBar":{"tick":1676,"endTime":600},"explode":null,"end":1683,"firstOp":null},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"52405","add":543,"hpBar":546,"fuseBar":{"tick":546,"endTime":600},"explode":568,"end":570,"firstOp":553},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"52404","add":543,"hpBar":546,"fuseBar":{"tick":546,"endTime":600},"explode":568,"end":570,"firstOp":null},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"52828","add":578,"hpBar":581,"fuseBar":{"tick":581,"endTime":600},"explode":603,"end":605,"firstOp":null},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"52829","add":578,"hpBar":581,"fuseBar":{"tick":581,"endTime":600},"explode":603,"end":605,"firstOp":null},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"53250","add":613,"hpBar":616,"fuseBar":{"tick":616,"endTime":600},"explode":638,"end":640,"firstOp":620},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"53249","add":613,"hpBar":616,"fuseBar":{"tick":616,"endTime":600},"explode":638,"end":640,"firstOp":null},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"53647","add":648,"hpBar":651,"fuseBar":{"tick":651,"endTime":600},"explode":673,"end":675,"firstOp":659},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"53648","add":648,"hpBar":651,"fuseBar":{"tick":651,"endTime":600},"explode":null,"end":659,"firstOp":655},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"54074","add":683,"hpBar":686,"fuseBar":{"tick":686,"endTime":600},"explode":null,"end":704,"firstOp":690},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"54073","add":683,"hpBar":686,"fuseBar":{"tick":686,"endTime":600},"explode":708,"end":710,"firstOp":694},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"54490","add":718,"hpBar":721,"fuseBar":{"tick":721,"endTime":600},"explode":743,"end":745,"firstOp":734},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"54491","add":718,"hpBar":721,"fuseBar":{"tick":721,"endTime":600},"explode":null,"end":735,"firstOp":726},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"54892","add":753,"hpBar":756,"fuseBar":{"tick":756,"endTime":600},"explode":778,"end":780,"firstOp":760},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"54891","add":753,"hpBar":756,"fuseBar":{"tick":756,"endTime":600},"explode":778,"end":780,"firstOp":765},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"55313","add":788,"hpBar":791,"fuseBar":{"tick":791,"endTime":600},"explode":813,"end":815,"firstOp":799},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"55314","add":788,"hpBar":791,"fuseBar":{"tick":791,"endTime":600},"explode":null,"end":810,"firstOp":796},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"55702","add":823,"hpBar":826,"fuseBar":{"tick":826,"endTime":600},"explode":848,"end":850,"firstOp":830},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"55701","add":823,"hpBar":826,"fuseBar":{"tick":826,"endTime":600},"explode":848,"end":850,"firstOp":837},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"56156","add":858,"hpBar":861,"fuseBar":{"tick":861,"endTime":600},"explode":null,"end":882,"firstOp":877},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"56157","add":858,"hpBar":861,"fuseBar":{"tick":861,"endTime":600},"explode":null,"end":878,"firstOp":869},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"56590","add":893,"hpBar":896,"fuseBar":{"tick":896,"endTime":600},"explode":null,"end":917,"firstOp":907},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"56589","add":893,"hpBar":896,"fuseBar":{"tick":896,"endTime":600},"explode":null,"end":909,"firstOp":900},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"56919","add":928,"hpBar":931,"fuseBar":{"tick":931,"endTime":600},"explode":null,"end":938,"firstOp":934},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"56920","add":928,"hpBar":931,"fuseBar":{"tick":931,"endTime":600},"explode":null,"end":943,"firstOp":937},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"57348","add":963,"hpBar":966,"fuseBar":{"tick":966,"endTime":600},"explode":null,"end":980,"firstOp":975},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"57347","add":963,"hpBar":966,"fuseBar":{"tick":966,"endTime":600},"explode":null,"end":975,"firstOp":970},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"57675","add":998,"hpBar":1001,"fuseBar":{"tick":1001,"endTime":600},"explode":null,"end":1009,"firstOp":1004},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"57676","add":998,"hpBar":1001,"fuseBar":{"tick":1001,"endTime":600},"explode":null,"end":1012,"firstOp":1007},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"58080","add":1033,"hpBar":1036,"fuseBar":{"tick":1036,"endTime":600},"explode":null,"end":1048,"firstOp":1044},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"58079","add":1033,"hpBar":1036,"fuseBar":{"tick":1036,"endTime":600},"explode":null,"end":1044,"firstOp":1040},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"58457","add":1068,"hpBar":1071,"fuseBar":{"tick":1071,"endTime":600},"explode":null,"end":1083,"firstOp":1076},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"58458","add":1068,"hpBar":1071,"fuseBar":{"tick":1071,"endTime":600},"explode":null,"end":1086,"firstOp":1082},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"58902","add":1103,"hpBar":1106,"fuseBar":{"tick":1106,"endTime":600},"explode":null,"end":1118,"firstOp":1112},
  {"capture":"yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt","index":"58901","add":1103,"hpBar":1106,"fuseBar":{"tick":1106,"endTime":600},"explode":null,"end":1114,"firstOp":1110},
  {"capture":"yama-contract-forfeit-breath-p3-voidflare-explosions-packet-data.txt","index":"48682","add":2339,"hpBar":2342,"fuseBar":{"tick":2342,"endTime":600},"explode":null,"end":2348,"firstOp":2344},
  {"capture":"yama-contract-forfeit-breath-p3-voidflare-explosions-packet-data.txt","index":"48683","add":2339,"hpBar":2342,"fuseBar":{"tick":2342,"endTime":600},"explode":2364,"end":2366,"firstOp":null},
  {"capture":"yama-contract-forfeit-breath-p3-voidflare-explosions-packet-data.txt","index":"51224","add":2409,"hpBar":2412,"fuseBar":{"tick":2412,"endTime":600},"explode":null,"end":2421,"firstOp":2417},
  {"capture":"yama-contract-forfeit-breath-p3-voidflare-explosions-packet-data.txt","index":"51223","add":2409,"hpBar":2412,"fuseBar":{"tick":2412,"endTime":600},"explode":2434,"end":2436,"firstOp":2422},
  {"capture":"yama-contract-forfeit-breath-p3-voidflare-explosions-packet-data.txt","index":"53255","add":2479,"hpBar":2482,"fuseBar":{"tick":2482,"endTime":600},"explode":null,"end":2488,"firstOp":2483},
  {"capture":"yama-contract-forfeit-breath-p3-voidflare-explosions-packet-data.txt","index":"53256","add":2479,"hpBar":2482,"fuseBar":{"tick":2482,"endTime":600},"explode":null,"end":2493,"firstOp":2490},
  {"capture":"yama-contract-forfeit-breath-p3-voidflare-explosions-packet-data.txt","index":"54907","add":2549,"hpBar":2552,"fuseBar":{"tick":2552,"endTime":600},"explode":null,"end":2558,"firstOp":2553},
  {"capture":"yama-contract-forfeit-breath-p3-voidflare-explosions-packet-data.txt","index":"54906","add":2549,"hpBar":2552,"fuseBar":{"tick":2552,"endTime":600},"explode":null,"end":2560,"firstOp":2556},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-p3-void-flare-explosions.txt","index":"59341","add":6022,"hpBar":6025,"fuseBar":{"tick":6025,"endTime":630},"explode":null,"end":6037,"firstOp":6028},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-p3-void-flare-explosions.txt","index":"59340","add":6022,"hpBar":6025,"fuseBar":{"tick":6025,"endTime":630},"explode":null,"end":6046,"firstOp":6037},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-p3-void-flare-explosions.txt","index":"62458","add":6127,"hpBar":6130,"fuseBar":{"tick":6130,"endTime":630},"explode":null,"end":6150,"firstOp":6141},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-p3-void-flare-explosions.txt","index":"62459","add":6127,"hpBar":6130,"fuseBar":{"tick":6130,"endTime":630},"explode":null,"end":6141,"firstOp":6132},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-p3-void-flare-explosions.txt","index":"33458","add":6270,"hpBar":6273,"fuseBar":{"tick":6273,"endTime":630},"explode":null,"end":6294,"firstOp":6285},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-p3-void-flare-explosions.txt","index":"33457","add":6270,"hpBar":6273,"fuseBar":{"tick":6273,"endTime":630},"explode":null,"end":6284,"firstOp":6274},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-p3-void-flare-explosions.txt","index":"36311","add":6375,"hpBar":6378,"fuseBar":{"tick":6378,"endTime":630},"explode":null,"end":6389,"firstOp":6380},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-p3-void-flare-explosions.txt","index":"36312","add":6375,"hpBar":6378,"fuseBar":{"tick":6378,"endTime":630},"explode":null,"end":6396,"firstOp":6387},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-p3-void-flare-explosions.txt","index":"40544","add":6528,"hpBar":6531,"fuseBar":{"tick":6531,"endTime":600},"explode":null,"end":6538,"firstOp":6534},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-p3-void-flare-explosions.txt","index":"40543","add":6528,"hpBar":6531,"fuseBar":{"tick":6531,"endTime":600},"explode":6553,"end":6555,"firstOp":6539},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-p3-void-flare-explosions.txt","index":"42546","add":6598,"hpBar":6601,"fuseBar":{"tick":6601,"endTime":600},"explode":null,"end":6608,"firstOp":6604},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-p3-void-flare-explosions.txt","index":"42547","add":6598,"hpBar":6601,"fuseBar":{"tick":6601,"endTime":600},"explode":null,"end":6616,"firstOp":6611},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-p3-void-flare-explosions.txt","index":"44682","add":6668,"hpBar":6671,"fuseBar":{"tick":6671,"endTime":600},"explode":null,"end":6676,"firstOp":6672},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-p3-void-flare-explosions.txt","index":"44681","add":6668,"hpBar":6671,"fuseBar":{"tick":6671,"endTime":600},"explode":6693,"end":6695,"firstOp":6683},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-p3-void-flare-explosions.txt","index":"46803","add":6738,"hpBar":6741,"fuseBar":{"tick":6741,"endTime":600},"explode":null,"end":6747,"firstOp":6742},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-p3-void-flare-explosions.txt","index":"46804","add":6738,"hpBar":6741,"fuseBar":{"tick":6741,"endTime":600},"explode":null,"end":6750,"firstOp":6745},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-p3-void-flare-explosions.txt","index":"49049","add":6808,"hpBar":6811,"fuseBar":{"tick":6811,"endTime":600},"explode":null,"end":6819,"firstOp":6815},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-p3-void-flare-explosions.txt","index":"49048","add":6808,"hpBar":6811,"fuseBar":{"tick":6811,"endTime":600},"explode":null,"end":6831,"firstOp":6823},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-p3-void-flare-explosions.txt","index":"51335","add":6878,"hpBar":6881,"fuseBar":{"tick":6881,"endTime":600},"explode":null,"end":6886,"firstOp":6882},
  {"capture":"yama-contract-of-glyphic-attenuation-packet-data-p3-void-flare-explosions.txt","index":"51336","add":6878,"hpBar":6881,"fuseBar":{"tick":6881,"endTime":600},"explode":null,"end":6890,"firstOp":6885},
  {"capture":"yama-normal-contract-203-magic-def-223-range-def-p3-packet-data.txt","index":"59126","add":2324,"hpBar":2327,"fuseBar":{"tick":2327,"endTime":600},"explode":null,"end":2335,"firstOp":2331},
  {"capture":"yama-normal-contract-203-magic-def-223-range-def-p3-packet-data.txt","index":"59127","add":2324,"hpBar":2327,"fuseBar":{"tick":2327,"endTime":600},"explode":null,"end":2342,"firstOp":2338},
  {"capture":"yama-normal-contract-203-magic-def-223-range-def-p3-packet-data.txt","index":"59972","add":2394,"hpBar":2397,"fuseBar":{"tick":2397,"endTime":600},"explode":null,"end":2405,"firstOp":2401},
  {"capture":"yama-normal-contract-203-magic-def-223-range-def-p3-packet-data.txt","index":"59971","add":2394,"hpBar":2397,"fuseBar":{"tick":2397,"endTime":600},"explode":null,"end":2411,"firstOp":2407},
  {"capture":"yama-normal-contract-203-magic-def-223-range-def-p3-packet-data.txt","index":"60861","add":2464,"hpBar":2467,"fuseBar":{"tick":2467,"endTime":600},"explode":null,"end":2473,"firstOp":2469},
  {"capture":"yama-normal-contract-203-magic-def-223-range-def-p3-packet-data.txt","index":"60862","add":2464,"hpBar":2467,"fuseBar":{"tick":2467,"endTime":600},"explode":null,"end":2477,"firstOp":2472},
  {"capture":"yama-normal-contract-203-magic-def-223-range-def-p3-packet-data.txt","index":"61601","add":2534,"hpBar":2537,"fuseBar":{"tick":2537,"endTime":600},"explode":null,"end":2545,"firstOp":2541},
  {"capture":"yama-normal-contract-203-magic-def-223-range-def-p3-packet-data.txt","index":"61600","add":2534,"hpBar":2537,"fuseBar":{"tick":2537,"endTime":600},"explode":null,"end":2552,"firstOp":2548},
  {"capture":"yama-normal-contract-203-magic-def-223-range-def-p3-packet-data.txt","index":"62492","add":2604,"hpBar":2607,"fuseBar":{"tick":2607,"endTime":600},"explode":null,"end":2614,"firstOp":2610},
  {"capture":"yama-normal-contract-203-magic-def-223-range-def-p3-packet-data.txt","index":"62493","add":2604,"hpBar":2607,"fuseBar":{"tick":2607,"endTime":600},"explode":null,"end":2617,"firstOp":2613},
  {"capture":"yama-normal-contract-203-magic-def-223-range-def-p3-packet-data.txt","index":"63295","add":2674,"hpBar":2677,"fuseBar":{"tick":2677,"endTime":600},"explode":null,"end":2691,"firstOp":2687},
  {"capture":"yama-normal-contract-203-magic-def-223-range-def-p3-packet-data.txt","index":"63294","add":2674,"hpBar":2677,"fuseBar":{"tick":2677,"endTime":600},"explode":null,"end":2688,"firstOp":2684},
  {"capture":"yama-normal-contract-203-magic-def-223-range-def-p3-packet-data.txt","index":"63922","add":2744,"hpBar":2747,"fuseBar":{"tick":2747,"endTime":600},"explode":null,"end":2755,"firstOp":2750},
  {"capture":"yama-normal-contract-203-magic-def-223-range-def-p3-packet-data.txt","index":"63923","add":2744,"hpBar":2747,"fuseBar":{"tick":2747,"endTime":600},"explode":null,"end":2758,"firstOp":2754},
  {"capture":"yama-normal-contract-203-magic-def-223-range-def-p3-packet-data.txt","index":"64569","add":2814,"hpBar":2817,"fuseBar":{"tick":2817,"endTime":600},"explode":null,"end":2827,"firstOp":2823},
  {"capture":"yama-normal-contract-203-magic-def-223-range-def-p3-packet-data.txt","index":"64568","add":2814,"hpBar":2817,"fuseBar":{"tick":2817,"endTime":600},"explode":null,"end":2830,"firstOp":2825},
  {"capture":"yama-normal-contract-203-magic-def-223-range-def-p3-packet-data.txt","index":"65255","add":2884,"hpBar":2887,"fuseBar":{"tick":2887,"endTime":600},"explode":null,"end":2894,"firstOp":2890},
  {"capture":"yama-normal-contract-203-magic-def-223-range-def-p3-packet-data.txt","index":"65256","add":2884,"hpBar":2887,"fuseBar":{"tick":2887,"endTime":600},"explode":null,"end":2899,"firstOp":2895},
  {"capture":"yama-normal-contract-203-magic-def-223-range-def-p3-packet-data.txt","index":"33506","add":2954,"hpBar":2957,"fuseBar":{"tick":2957,"endTime":600},"explode":null,"end":2966,"firstOp":2962},
  {"capture":"yama-normal-contract-203-magic-def-223-range-def-p3-packet-data.txt","index":"33505","add":2954,"hpBar":2957,"fuseBar":{"tick":2957,"endTime":600},"explode":null,"end":2970,"firstOp":2966},
  {"capture":"yama-normal-contract-203-magic-def-223-range-def-p3-packet-data.txt","index":"34353","add":3024,"hpBar":3027,"fuseBar":{"tick":3027,"endTime":600},"explode":null,"end":3049,"firstOp":3031},
  {"capture":"yama-normal-contract-203-magic-def-223-range-def-p3-packet-data.txt","index":"34354","add":3024,"hpBar":3027,"fuseBar":{"tick":3027,"endTime":600},"explode":3049,"end":3051,"firstOp":3035},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"57541","add":1831,"hpBar":1834,"fuseBar":{"tick":1834,"endTime":630},"explode":1857,"end":1859,"firstOp":1849},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"57542","add":1831,"hpBar":1834,"fuseBar":{"tick":1834,"endTime":630},"explode":null,"end":1847,"firstOp":1838},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"60399","add":2113,"hpBar":2116,"fuseBar":{"tick":2116,"endTime":630},"explode":null,"end":2119,"firstOp":null},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"60398","add":2113,"hpBar":2116,"fuseBar":{"tick":2116,"endTime":630},"explode":null,"end":2119,"firstOp":null},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"62095","add":2258,"hpBar":2261,"fuseBar":{"tick":2261,"endTime":600},"explode":null,"end":2267,"firstOp":2263},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"62096","add":2258,"hpBar":2261,"fuseBar":{"tick":2261,"endTime":600},"explode":null,"end":2270,"firstOp":2266},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"62858","add":2328,"hpBar":2331,"fuseBar":{"tick":2331,"endTime":600},"explode":null,"end":2340,"firstOp":2336},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"62857","add":2328,"hpBar":2331,"fuseBar":{"tick":2331,"endTime":600},"explode":null,"end":2337,"firstOp":2333},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"63692","add":2398,"hpBar":2401,"fuseBar":{"tick":2401,"endTime":600},"explode":null,"end":2407,"firstOp":2403},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"63693","add":2398,"hpBar":2401,"fuseBar":{"tick":2401,"endTime":600},"explode":null,"end":2414,"firstOp":2410},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"64538","add":2468,"hpBar":2471,"fuseBar":{"tick":2471,"endTime":600},"explode":null,"end":2476,"firstOp":2472},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"64537","add":2468,"hpBar":2471,"fuseBar":{"tick":2471,"endTime":600},"explode":null,"end":2479,"firstOp":2475},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"64968","add":2503,"hpBar":2506,"fuseBar":{"tick":2506,"endTime":360},"explode":null,"end":2518,"firstOp":2514},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"65450","add":2538,"hpBar":2541,"fuseBar":{"tick":2541,"endTime":600},"explode":null,"end":2550,"firstOp":2546},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"65451","add":2538,"hpBar":2541,"fuseBar":{"tick":2541,"endTime":600},"explode":null,"end":2547,"firstOp":2543},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"33734","add":2608,"hpBar":2611,"fuseBar":{"tick":2611,"endTime":600},"explode":null,"end":2617,"firstOp":2613},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"33733","add":2608,"hpBar":2611,"fuseBar":{"tick":2611,"endTime":600},"explode":null,"end":2620,"firstOp":2616},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"34430","add":2678,"hpBar":2681,"fuseBar":{"tick":2681,"endTime":600},"explode":null,"end":2693,"firstOp":2689},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"34431","add":2678,"hpBar":2681,"fuseBar":{"tick":2681,"endTime":600},"explode":null,"end":2689,"firstOp":2685},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"35202","add":2748,"hpBar":2751,"fuseBar":{"tick":2751,"endTime":600},"explode":null,"end":2760,"firstOp":2756},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"35201","add":2748,"hpBar":2751,"fuseBar":{"tick":2751,"endTime":600},"explode":null,"end":2763,"firstOp":2759},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"35868","add":2818,"hpBar":2821,"fuseBar":{"tick":2821,"endTime":600},"explode":null,"end":2834,"firstOp":2830},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"35869","add":2818,"hpBar":2821,"fuseBar":{"tick":2821,"endTime":600},"explode":null,"end":2831,"firstOp":2827},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"36658","add":2888,"hpBar":2891,"fuseBar":{"tick":2891,"endTime":600},"explode":null,"end":2899,"firstOp":2894},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"36657","add":2888,"hpBar":2891,"fuseBar":{"tick":2891,"endTime":600},"explode":null,"end":2896,"firstOp":2892},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"37489","add":2958,"hpBar":2961,"fuseBar":{"tick":2961,"endTime":600},"explode":null,"end":2970,"firstOp":2966},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"37490","add":2958,"hpBar":2961,"fuseBar":{"tick":2961,"endTime":600},"explode":null,"end":2967,"firstOp":2963},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"38287","add":3028,"hpBar":3031,"fuseBar":{"tick":3031,"endTime":600},"explode":null,"end":3037,"firstOp":3033},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"38286","add":3028,"hpBar":3031,"fuseBar":{"tick":3031,"endTime":600},"explode":null,"end":3042,"firstOp":3036},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"39041","add":3098,"hpBar":3101,"fuseBar":{"tick":3101,"endTime":600},"explode":null,"end":3108,"firstOp":3104},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"39042","add":3098,"hpBar":3101,"fuseBar":{"tick":3101,"endTime":600},"explode":null,"end":3111,"firstOp":3106},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"39928","add":3168,"hpBar":3171,"fuseBar":{"tick":3171,"endTime":600},"explode":null,"end":3177,"firstOp":3173},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"39927","add":3168,"hpBar":3171,"fuseBar":{"tick":3171,"endTime":600},"explode":null,"end":3180,"firstOp":3176},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"40135","add":3182,"hpBar":3185,"fuseBar":{"tick":3185,"endTime":360},"explode":null,"end":3196,"firstOp":3192},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"40262","add":3189,"hpBar":3192,"fuseBar":{"tick":3192,"endTime":360},"explode":null,"end":3203,"firstOp":3199},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"40337","add":3196,"hpBar":3199,"fuseBar":{"tick":3199,"endTime":360},"explode":3213,"end":3215,"firstOp":3211},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"40900","add":3238,"hpBar":3241,"fuseBar":{"tick":3241,"endTime":600},"explode":null,"end":3248,"firstOp":3244},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"40901","add":3238,"hpBar":3241,"fuseBar":{"tick":3241,"endTime":600},"explode":null,"end":3261,"firstOp":3256},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"41073","add":3252,"hpBar":3255,"fuseBar":{"tick":3255,"endTime":360},"explode":null,"end":3264,"firstOp":3259},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"41585","add":3287,"hpBar":3290,"fuseBar":{"tick":3290,"endTime":360},"explode":null,"end":3301,"firstOp":3297},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"42015","add":3308,"hpBar":3311,"fuseBar":{"tick":3311,"endTime":600},"explode":null,"end":3316,"firstOp":3312},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"42016","add":3308,"hpBar":3311,"fuseBar":{"tick":3311,"endTime":600},"explode":null,"end":3319,"firstOp":3315},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"42370","add":3322,"hpBar":3325,"fuseBar":{"tick":3325,"endTime":360},"explode":3339,"end":3341,"firstOp":null},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"42497","add":3329,"hpBar":3332,"fuseBar":{"tick":3332,"endTime":360},"explode":3346,"end":3348,"firstOp":null},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"42669","add":3336,"hpBar":3339,"fuseBar":{"tick":3339,"endTime":360},"explode":null,"end":3350,"firstOp":3346},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"43362","add":3378,"hpBar":3381,"fuseBar":{"tick":3381,"endTime":600},"explode":null,"end":3393,"firstOp":3388},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"43363","add":3378,"hpBar":3381,"fuseBar":{"tick":3381,"endTime":600},"explode":null,"end":3390,"firstOp":3386},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"43925","add":3406,"hpBar":3409,"fuseBar":{"tick":3409,"endTime":360},"explode":null,"end":3415,"firstOp":3411},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"44476","add":3448,"hpBar":3451,"fuseBar":{"tick":3451,"endTime":600},"explode":null,"end":3456,"firstOp":3452},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"44477","add":3448,"hpBar":3451,"fuseBar":{"tick":3451,"endTime":600},"explode":null,"end":3460,"firstOp":3455},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"45372","add":3518,"hpBar":3521,"fuseBar":{"tick":3521,"endTime":600},"explode":null,"end":3530,"firstOp":3526},
  {"capture":"yama-normal-contract-long-p3-packet-data.txt","index":"45371","add":3518,"hpBar":3521,"fuseBar":{"tick":3521,"endTime":600},"explode":null,"end":3533,"firstOp":3529},
];

/**
 * Each scorching bow special (capture ticks): the Chebyshev distance from the player's tile to Yama's
 * footprint at the projectile, the ticks until the next special (null for the last), the
 * cast-relative ticks Yama walked/ran in the next 30, the cast-relative tick of the first non-burn
 * splat on Yama in cast+1..+5, and whether no thrall shot fell within five ticks of the cast.
 */
export interface ScorchingCast {
  readonly capture: string;
  readonly tick: number;
  readonly distance: number;
  readonly untilNextCast: number | null;
  readonly steppedOnCastRelativeTicks: readonly number[];
  readonly splat: number | null;
  readonly soleAttacker: boolean;
}

// biome-ignore format: one extracted record per line keeps the fixture reviewable
export const YAMA_SCORCHING_CASTS: readonly ScorchingCast[] = [
  {"capture":"yama-contract-of-sensory-clouding-packet-data-1(incomplete).txt","tick":8843,"distance":3,"untilNextCast":56,"steppedOnCastRelativeTicks":[1,23,24,25,26,27,28,29,30],"splat":3,"soleAttacker":true},
  {"capture":"yama-contract-of-sensory-clouding-packet-data-1(incomplete).txt","tick":8899,"distance":4,"untilNextCast":30,"steppedOnCastRelativeTicks":[1,23,24,25,26,27,28,29,30],"splat":3,"soleAttacker":true},
  {"capture":"yama-contract-of-sensory-clouding-packet-data-1(incomplete).txt","tick":8929,"distance":2,"untilNextCast":49,"steppedOnCastRelativeTicks":[1,23,24,25,26,27,28,29,30],"splat":3,"soleAttacker":true},
  {"capture":"yama-contract-of-sensory-clouding-packet-data-1(incomplete).txt","tick":8978,"distance":3,"untilNextCast":23,"steppedOnCastRelativeTicks":[1,23,24],"splat":3,"soleAttacker":true},
  {"capture":"yama-contract-of-sensory-clouding-packet-data-1(incomplete).txt","tick":9001,"distance":3,"untilNextCast":42,"steppedOnCastRelativeTicks":[1,23,25,26,27,28,29,30],"splat":3,"soleAttacker":true},
  {"capture":"yama-contract-of-sensory-clouding-packet-data-1(incomplete).txt","tick":9043,"distance":3,"untilNextCast":null,"steppedOnCastRelativeTicks":[1,23,24,25,26,27,28,29],"splat":3,"soleAttacker":true},
  {"capture":"yama-contract-of-sensory-clouding-p3-contributed-packet-data(incomplete).txt","tick":1564,"distance":1,"untilNextCast":20,"steppedOnCastRelativeTicks":[],"splat":3,"soleAttacker":true},
  {"capture":"yama-contract-of-sensory-clouding-p3-contributed-packet-data(incomplete).txt","tick":1584,"distance":3,"untilNextCast":50,"steppedOnCastRelativeTicks":[23,24,25,26,27],"splat":3,"soleAttacker":true},
  {"capture":"yama-contract-of-sensory-clouding-p3-contributed-packet-data(incomplete).txt","tick":1634,"distance":2,"untilNextCast":20,"steppedOnCastRelativeTicks":[1],"splat":2,"soleAttacker":false},
  {"capture":"yama-contract-of-sensory-clouding-p3-contributed-packet-data(incomplete).txt","tick":1654,"distance":3,"untilNextCast":null,"steppedOnCastRelativeTicks":[23,24,25,26],"splat":2,"soleAttacker":false},
];
