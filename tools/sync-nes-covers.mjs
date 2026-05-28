import fs from 'node:fs/promises';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import https from 'node:https';

const root = path.resolve(import.meta.dirname, '..');
const gamesPath = path.join(root, 'host/public/games.json');
const outDir = path.join(root, 'host/public/covers/boxarts');
const manifestPath = path.join(root, 'host/public/covers/manifest.json');
const baseUrl = 'https://thumbnails.libretro.com/Nintendo%20-%20Nintendo%20Entertainment%20System/Named_Boxarts/';

const rules = [
  [/七宝奇谋/, 'Goonies, The (USA).png'],
  [/假面忍者 - 花丸/, 'Kamen no Ninja - Hanamaru'],
  [/假面的忍者 - 赤影/, 'Kamen no Ninja - Akakage'],
  [/光之神话/, 'Kid Icarus (USA).png'],
  [/冒险岛4/, 'Takahashi Meijin no Bouken-jima IV (Japan).png'],
  [/冒险岛3/, 'Adventure Island 3 (USA).png'],
  [/冒险岛2/, 'Adventure Island II (USA).png'],
  [/冒险岛/, 'Adventure Island (USA).png'],
  [/前线大作战/, 'Front Line (Japan).png'],
  [/剑王|恶魔之剑/, 'Sword Master (1992-01)(Activision)(US).png'],
  [/加菲猫/, 'Garfield - A Week of Garfield (Japan).png'],
  [/南极/, 'Kekkyoku Nankyoku Daibouken (Japan).png'],
  [/动动脑2/, 'Middle School English - Dong Dong Nao - Guo Zhong Ying Wen (1989)(Sachen)(TW)[p][SA-003].png'],
  [/双截龙3/, 'Double Dragon III - The Sacred Stones (USA).png'],
  [/双截龙2/, 'Double Dragon II - The Revenge (USA).png'],
  [/口袋里的魔鬼/, 'Monster In My Pocket (1992-01)(Konami)(US).png'],
  [/哆啦A梦/, 'Doraemon (1986-12-12)(Hudson)(JP).png'],
  [/大力水手/, 'Popeye (World).png'],
  [/大金刚3/, 'Donkey Kong 3 (World).png'],
  [/大金刚Jr/, 'Donkey Kong Jr. (World).png'],
  [/大金刚/, 'Donkey Kong (World).png'],
  [/快乐猫/, 'Felix the Cat (1992-10)(Hudson)(US).png'],
  [/快打旋风/, 'Mighty Final Fight (1993-06-11)(Capcom)(JP).png'],
  [/忍者神龟2|忍者龟2/, 'Teenage Mutant Ninja Turtles II - The Arcade Game (USA).png'],
  [/忍者龙剑传3/, 'Ninja Gaiden III - The Ancient Ship of Doom (USA).png'],
  [/忍者龙剑传/, 'Ninja Gaiden (USA).png'],
  [/恶魔城2/, "Castlevania II - Simon's Quest (USA).png"],
  [/成龙之龙/, "Jackie Chan's Action Kung Fu (USA).png"],
  [/成龙踢馆/, 'Kung-Fu Heroes (USA).png'],
  [/敲冰块/, 'Ice Climber (USA, Europe).png'],
  [/斗者的挽歌/, 'Trojan (1987-02)(Capcom)(US).png'],
  [/机器子战记/, 'Robocco Wars (Japan).png'],
  [/梦之勇士/, 'Little Nemo - The Dream Master (1990-09)(Capcom)(US).png'],
  [/梦企鹅物语/, 'Yume Penguin Monogatari (1991-01-25)(Konami)(JP).png'],
  [/气球大战/, 'Balloon Fight (USA).png'],
  [/泡泡龙2/, 'Bubble Bobble Part 2 (USA).png'],
  [/泡泡龙/, 'Bubble Bobble (USA).png'],
  [/洛克人6/, 'Mega Man 6 (USA).png'],
  [/洛克人5/, 'Mega Man 5 (USA).png'],
  [/洛克人4/, 'Mega Man 4 (USA).png'],
  [/洛克人3/, 'Mega Man 3 (USA).png'],
  [/洛克人2/, 'Mega Man 2 (USA).png'],
  [/洛克人/, 'Mega Man (USA).png'],
  [/热血物语/, 'River City Ransom (USA).png'],
  [/猫捉老鼠|猫之狂欢/, 'Mappy (1984-11-14)(Namco)(JP).png'],
  [/玛莉欧兄弟拆屋工/, 'Wrecking Crew (1985-06-18)(Nintendo).png'],
  [/米老鼠/, 'Mickey Mouse (1987-03-06)(Hudson)(JP).png'],
  [/纽约大拳猫/, "Rockin' Kats (1991-09)(Atlus Software)(US).png"],
  [/绿色兵团/, "Rush'n Attack (USA).png"],
  [/美猴王/, 'Ganso Saiyuuki - Super Monkey Daibouken (Japan).png'],
  [/茶茶丸之大冒险/, 'Jajamaru no Daibouken (Japan).png'],
  [/超惑星战记/, 'Blaster Master (1988-11)(Sunsoft)(US).png'],
  [/超级玛莉欧兄弟3|超级马里奥兄弟3/, 'Super Mario Bros. 3 (USA).png'],
  [/超级玛莉欧兄弟2/, 'Super Mario Bros. 2 (USA).png'],
  [/超级玛莉|超级玛莉欧兄弟|超级马里奥兄弟/, 'Super Mario Bros. (World).png'],
  [/马里奥兄弟|玛莉欧兄弟/, 'Mario Bros. (World).png'],
  [/超级魂斗罗|超级魂2/, 'Super C (USA).png'],
  [/魂斗罗力量/, 'Contra Force (USA).png'],
  [/魂斗罗/, 'Contra (USA).png'],
  [/赤影战士/, 'Shadow of the Ninja (USA).png'],
  [/阿尔戈斯战士/, 'Rygar (USA).png'],
  [/阿拉丁/, 'Aladdin (1995)(-)(AS)[p].png'],
  [/霹雳神兵/, 'Power Blade (1991-03)(Taito Software)(US).png'],
  [/餐厅争夺战/, 'Panic Restaurant (USA).png'],
  [/魔法总动员/, 'Magic of Scheherazade, The (1989-12)(Culture Brain)(US).png'],
  [/鸟人战队/, 'Choujin Sentai - Jetman (1991-12-21)(Angel)(JP).png'],
  [/马戏团/, 'Circus Charlie (Japan).png'],
  [/地狱极乐丸/, 'Kabuki - Quantum Fighter (1991-01)(Hal America)(US).png'],
  [/大力工头 阿源君/, 'Daiku no Gen-san (Japan).png'],
  [/赖皮狗/, 'Wacky Races (1992)(Atlus)(EU).png'],
  [/超级中国人2/, 'Super Chinese 2 - Dragon Kid (Japan).png'],
  [/魔城传说2/, 'Majou Densetsu 2 - Daimashikyou Galious (1987-08-11)(Konami)(JP).png'],
  [/包青天/, 'Bao Qing Tian (1996)(-)(AS)[p].png'],
  [/忍者龟格斗|激龟格斗/, 'Teenage Mutant Ninja Turtles - Tournament Fighters (USA).png'],
  [/激龟忍者传/, 'Teenage Mutant Ninja Turtles (USA).png'],
  [/企鹅先生/, 'Penguin-kun Wars (1985-12-25)(ASCII)(JP).png'],
  [/俄罗斯方块/, 'Tetris (USA).png'],
  [/吃豆小精灵/, 'Pac-Man (USA) (Namco).png'],
  [/埃及/, 'Egypt (Japan).png'],
  [/大眼蛙大冒险/, 'Kero Kero Keroppi no Daibouken (Japan).png'],
  [/弹射球/, 'Arkanoid (1986-12-26)(Taito)(JP).png'],
  [/打空气/, 'Brush Roller (Asia) (Ja) (Unl).png'],
  [/摩艾君/, 'Moai-kun (Japan).png'],
  [/斗智拼盘/, 'Flipull - An Exciting Cube Game (Japan) (En).png'],
  [/暴走淘金者2/, 'Championship Lode Runner (Japan).png'],
  [/暴走淘金者/, 'Lode Runner (1984-07-31)(Hudson)(JP).png'],
  [/趣味方块/, 'Puzznic (USA).png'],
  [/轰炸超人II/, 'Bomberman II (USA).png'],
  [/轰炸超人|炸弹人/, 'Bomberman (USA).png'],
  [/汉堡包/, 'BurgerTime (USA).png'],
  [/玛莉医生|马里奥医生/, 'Dr. Mario (Japan, USA).png'],
  [/公路之星2/, 'Rad Racer II (USA).png'],
  [/公路之星/, 'Rad Racer (USA).png'],
  [/公路赛车/, 'Road Fighter (1985-07-11)(Konami)(JP).png'],
  [/超级冲刺赛/, 'Super Sprint (1989)(Tengen)(US).png'],
  [/火龙/, 'Fire Dragon (Asia) (En) (Unl).png'],
  [/合金风暴/, 'Metal Storm (USA).png'],
  [/虎穴行动/, 'Code Name - Viper (USA).png'],
  [/塞尔达传说/, 'Legend of Zelda, The (USA).png'],
  [/封神榜/, 'Feng Shen Bang (Asia) (Ja) (Unl).png'],
  [/林则徐禁烟/, 'Lin Ze Xu Jin Yan (Asia) (Unl).png'],
  [/大战略/, 'Daisenryaku (Japan).png'],
  [/成吉思汗/, 'Genghis Khan (USA).png'],
  [/机器战士高达/, 'Mobile Suit Z Gundam - Hot Scramble (1986-08-28)(Bandai)(JP).png'],
  [/口袋妖怪四合一/, 'Pokemon 4 in 1 (199x)(Union Bond)(CN)[p][G-0001].png'],
  [/口袋.*金|口袋.*水晶|口袋.*珍珠|口袋.*钻石|口袋怪兽II|口袋怪兽III/, 'Pokemon Gold (199x)(Mars)(CN)[p].png'],
  [/口袋.*绿叶|口袋.*白玉|口袋.*翡翠/, 'Pokemon - Green Version (19xx)(-)(AS)[p][K1912].png'],
  [/太空战士5/, 'Final Fantasy (1990-05)(Nintendo)(US).png'],
  [/怪物制造者/, 'Monster Maker - 7 Tsu no Hihou (Japan).png'],
  [/混沌世界/, 'Chaos World (Japan).png'],
  [/机甲战士/, 'Metal Max (Japan).png'],
  [/魔神英雄传外传/, 'Majin Eiyuu Den Wataru Gaiden (1990-03-23)(Hudson)(JP).png'],
  [/龙魂/, 'Dragon Spirit - The New Legend (USA).png'],
  [/龙珠英雄/, 'Hanjuku Hero (Japan).png'],
  [/楚汉争霸/, 'Chu Han Zheng Ba - The War Between Chu & Han (1997)(Waixing)(CN)[p].png'],
  [/战国风云/, 'Zhan Guo Qun Xiong Zhuan (1996)(Waixing)(CN)[p].png'],
  [/第二次超级机器人大战|第2次超级机器人大战/, 'Dai-2-Ji Super Robot Taisen (Japan).png'],
  [/热血篮球/, 'Nekketsu! Street Basket - Ganbare Dunk Heroes (Japan).png'],
  [/热血进行曲/, 'Downtown - Nekketsu Koushinkyoku - Soreyuke Daiundoukai (Japan).png'],
  [/热血高校躲避球部/, 'Super Dodge Ball (USA).png'],
  [/花式九球/, 'Side Pocket (1987-06)(Data East)(US).png'],
  [/兵蜂3/, 'TwinBee 3 - Poko Poko Dai Maou (Japan).png'],
  [/兵蜂/, 'TwinBee (Japan).png'],
  [/加纳战机/, 'Gun Nac (USA).png'],
  [/变形战机Z/, 'Formation Z (Japan).png'],
  [/古巴战士/, 'Guerrilla War (USA).png'],
  [/嘉蒂外传/, 'Guardian Legend, The (USA).png'],
  [/坦克大战|坦克大作战/, 'Battle City (Japan).png'],
  [/大蜜蜂/, 'Galaga (Japan).png'],
  [/导弹坦克/, 'Missile Tank (1994)(Y.S)(AS)[p].png'],
  [/火鸟/, 'Hino Tori - Houou Hen - Gaou no Bouken (Japan).png'],
  [/烈火92/, "Summer Carnival '92 - Recca (1992-07-17)(Naxat)(JP).png"],
  [/空中魂斗罗/, 'S.C.A.T. - Special Cybernetic Attack Team (USA).png'],
  [/荒野大镖客/, 'Gun.Smoke (1988-02)(Capcom)(US).png'],
  [/超时空要塞/, 'Choujikuu Yousai - Macross (1985-12-10)(Bandai)(JP).png'],
  [/超级铁板阵/, 'Zanac (USA).png'],
  [/超越地平线/, 'Over Horizon (Japan).png'],
  [/铁血战士/, 'Predator (USA).png'],
  [/飞人战士/, 'Flying Warriors (USA).png'],
  [/热血格斗传说/, 'Nekketsu Kakutou Densetsu (Japan).png'],
  [/偷看扑克/, 'Peek-A-Boo Poker (USA) (Unl).png'],
  [/扑克精灵/, 'Mari, Ayami, Luka no AV Poker - Pu Nu Jing Ling (1991)(Hacker International)(AS)[p].png'],
  [/扑克/, 'Poker (1990)(Hacker International)(AS)[p][english cart].png'],
  [/内藤九段/, 'Honshougi - Naitou 9 Dan Shougi Hiden (Japan).png'],
  [/麻雀/, 'Mahjong (Japan).png'],
  [/弹珠台/, 'Pinball (World).png'],
  [/黑白棋/, 'Othello (Japan).png']
];

function request(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(request(new URL(res.headers.location, url).toString()));
      } else {
        resolve(res);
      }
    }).on('error', reject);
  });
}

function decodeHtml(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"');
}

async function boxartIndex() {
  const res = await request(baseUrl);
  if (res.statusCode !== 200) throw new Error(`Failed to load boxart index: ${res.statusCode}`);
  let html = '';
  for await (const chunk of res) html += chunk;
  return [...html.matchAll(/<a href="[^"]+">([^<]+\.png)<\/a>/g)].map((m) => decodeHtml(m[1]));
}

function pickBoxart(names, term) {
  const simpleTerm = term
    .replace(/\.png$/i, '')
    .replace(/\s*\([^)]*\).*$/g, '')
    .trim();
  const candidates = names.filter((name) =>
    name.toLowerCase().includes(term.toLowerCase()) ||
    (simpleTerm && name.toLowerCase().includes(simpleTerm.toLowerCase()))
  );
  if (!candidates.length) throw new Error(`No boxart match: ${term}`);
  const score = (name) => {
    let value = 0;
    if (name === `${simpleTerm} (USA).png`) value += 1000;
    if (name.includes('(USA).png')) value += 420;
    if (name.includes('(World).png')) value += 390;
    if (name.includes('(Japan).png')) value += 350;
    if (name.includes('(Europe).png')) value += 280;
    if (!/\[(b|h|o|p|t|tr|u|mapper|iNES)/i.test(name)) value += 120;
    if (/\(\d{4}/.test(name)) value += 40;
    value -= name.length / 10;
    return value;
  };
  return candidates.sort((a, b) => score(b) - score(a))[0];
}

function slug(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function download(filename, outputName) {
  const target = path.join(outDir, `${outputName}.png`);
  try {
    await fs.access(target);
    return `/covers/boxarts/${outputName}.png`;
  } catch {}

  const url = `${baseUrl}${encodeURIComponent(filename).replace(/%2F/g, '/')}`;
  const res = await request(url);
  if (res.statusCode !== 200) {
    throw new Error(`Failed ${res.statusCode}: ${filename}`);
  }
  await pipeline(res, createWriteStream(target));
  return `/covers/boxarts/${outputName}.png`;
}

await fs.mkdir(outDir, { recursive: true });
const data = JSON.parse(await fs.readFile(gamesPath, 'utf8'));
const names = await boxartIndex();
const uniqueDownloads = new Map();
let manifest = {};
try {
  manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
} catch {}
manifest = Object.fromEntries(Object.entries(manifest).filter(([, value]) => !value.includes('/generated/')));
let mapped = 0;

for (const game of data.games) {
  const rule = rules.find(([pattern]) => pattern.test(game.name));
  if (!rule) continue;
  let filename;
  try {
    filename = pickBoxart(names, rule[1]);
  } catch (error) {
    console.warn(error.message);
    continue;
  }
  const outputName = slug(filename.replace(/\.png$/i, ''));
  if (!uniqueDownloads.has(filename)) {
    uniqueDownloads.set(filename, await download(filename, outputName));
  }
  manifest[game.path] = uniqueDownloads.get(filename);
  mapped += 1;
}

await fs.mkdir(path.dirname(manifestPath), { recursive: true });
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Mapped ${mapped} games to ${uniqueDownloads.size} downloaded boxarts.`);
console.log(`Manifest coverage: ${Object.keys(manifest).length}/${data.games.length}.`);
