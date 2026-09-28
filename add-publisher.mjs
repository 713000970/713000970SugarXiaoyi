import fs from 'fs';

const H3 = '## 三、出版社/教辅公司出版及数智化最新动态';

const additions = {
  '2026-W17': [
    '- **人教社推动"书香校园"联盟走进新疆**：中小学"书香校园"联盟系列活动新疆中小学"百校共读"阅读研讨活动启幕，教育出版机构的校园阅读服务与配套阅读资源建设持续推进。[原文](https://www.pep.com.cn/rjdt/rjdt/202604/t20260420_2006452.shtml)',
    '- **"可见的学习"作者约翰·哈蒂教授访问教育科学出版社**：国际教育研究成果与出版机构深度交流，为教师读物与教育理论图书的引进开发提供选题支撑。[原文](https://www.esph.com.cn/jkzx/a1c4782cbbef428bbcd4bc69d27098a0.htm)',
  ],
  '2026-W18': [
    '- **教育出版集团参与"书香暖神州"图书捐赠**：韬奋基金会联合中国教育出版传媒集团等在第五届全民阅读大会期间举办图书捐赠仪式，教育出版企业持续投入全民阅读公益。[原文](https://www.pep.com.cn/rjdt/mtbd/202604/t20260427_2006532.shtml)',
    '- **新华社图解《国家安全教育中小学生读本》**：中小学生国家安全教育读本进入宣传推广期，读本类产品的进校使用与配套讲解资源需求明确。[原文](https://www.pep.com.cn/rjdt/mtbd/202604/t20260429_2006586.shtml)',
  ],
  '2026-W19': [
    '- **教育科学出版社首次亮相中国教育装备展示会**：教科社参展第87届中国教育装备展示会，教育出版企业加快融入教育装备与数字化产品渠道。[原文](https://www.esph.com.cn/jkzx/d565184a705f492192266d5ca6ad91ea.htm)',
    '- **教育科学出版社2025年度社会效益考核获评优秀**：出版单位社会效益评价结果公布，教材教辅出版质量与公益服务表现成为核心考核维度。[原文](https://www.esph.com.cn/jkzx/94a5b32b138443a28c2590a6b876f170.htm)',
  ],
  '2026-W20': [
    '- **国家新闻出版署部署2026年度高级职称评审**：出版行业职称评审工作启动，出版人才队伍建设与专业能力评价体系进一步完善。[原文](https://www.chinaxwcb.com/2026/05/15/99877871.html)',
  ],
  '2026-W21': [
    '- **全国中小学"人工智能+教育"专题交流活动在南京举办**：教育出版机构参与人工智能教育交流，AI 教育内容与配套数字资源方向持续升温。[原文](https://www.esph.com.cn/jkzx/6222b06c8949419e8934c8784a522dc4.htm)',
    '- **人教社《中小学心理健康教育读本》教学试点推进**：心理健康教育读本进入教学试点阶段，读本类产品的进校服务与教师指导资源同步跟进。[原文](https://www.pep.com.cn/rjdt/rjdt/202605/t20260521_2006699.shtml)',
  ],
  '2026-W22': [
    '- **人教社参加文化强国建设高峰论坛出版融合发展论坛**：教育出版融合发展路径在行业论坛集中展示，传统教辅出版的数字化协同成为方向。[原文](https://www.pep.com.cn/rjdt/rjdt/202605/t20260525_2006710.shtml)',
    '- **2026年教科版小学科学教材全国培训会在杭州举办**：教科版小学科学新教材培训全面启动，教材培训服务与配套教研资源同步展开。[原文](https://www.esph.com.cn/jkzx/7f03e304bf954bda98399c489e637a5b.htm)',
  ],
  '2026-W23': [
    '- **《天天爱科学——你好呀！故宫》科普动画片创作分享会举办**：教育科学出版社少儿科普产品跨界动画形态，出版内容的多媒体融合开发提速。[原文](https://www.esph.com.cn/jkzx/63b0c91ed39f4d1e90e65e9916087fd6.htm)',
  ],
  '2026-W25': [
    '- **《新时代教育强国建设研究丛书》出版**：山东出版推出6册教育强国主题研究丛书，教育理论出版服务教育强国战略议题。[原文](https://www.sdpress.com.cn/Art/11/23/ArtDetail_563_1.html)',
    '- **《南京文学地图》新书首发暨研学项目启动**：凤凰传媒"读城系列"将出版内容与研学课程结合，文教融合产品形态进一步拓展。[原文](https://www.ppm.cn/index.php/Article/index?id=12618)',
  ],
  '2026-W26': [
    '- **教育科学出版社云教研平台"科学课堂评价模型"专家咨询会召开**：教研服务数字化平台建设推进，出版机构从内容提供走向教研服务支撑。[原文](https://www.esph.com.cn/jkzx/e1c0b4aa218645f785407d1ce0df56ed.htm)',
  ],
  '2026-W27': [
    '- **教科社承办三省区幼儿园教师科学与美育素养提升培训**："京彩赋能·青新黔行"培训活动落地，教育出版机构的教师培训服务半径持续扩大。[原文](https://www.esph.com.cn/jkzx/8cd93a91b3f2456d80b3366f6561cf06.htm)',
  ],
  '2026-W29': [
    '- **三科统编教材及学生读本国家级示范培训成功举办**：2026年统编教材与读本国家级示范培训完成，教材使用的教师培训与配套资源需求集中释放。[原文](https://www.pep.com.cn/rjdt/rjdt/202607/t20260715_2007168.shtml)',
    '- **教科社首套"幼儿园项目式学习系列丛书"发布**：幼儿园项目式学习理论建构与实践探索交流活动同期举办，学前教育出版新品类亮相。[原文](https://www.esph.com.cn/jkzx/305fab1f2e6249c19d951a35b2db1793.htm)',
  ],
  '2026-W30': [
    '- **首届全国青少年科学实验能力大赛（北京赛区）决赛收官**：教育科学出版社参与的青少年科学实践赛事推进，科学教育出版与实验实践场景联动。[原文](https://www.esph.com.cn/jkzx/61c1204b42f94f63b52ccbb7408543c0.htm)',
  ],
  '2026-W31': [
    '- **山东新华书店集团威海"至海空间店"获央视《新闻联播》报道**：新华发行渠道向文化空间转型，教辅图书发行终端的场景创新受到关注。[原文](https://www.sdpress.com.cn/News/1/102/NewsDetail_11411_1.html)',
  ],
  '2026-W32': [
    '- **人民日报聚焦"跟着课本研学"**：课本内容与研学实践深度融合，教材教辅配套的研学课程与实践活动成为新增长点。[原文](https://www.pep.com.cn/rjdt/mtbd/202608/t20260806_2007491.shtml)',
    '- **全国青少年科学实验能力大赛（北京赛区）颁奖仪式举行**：教科社参与的青少年科学实践赛事完成颁奖，科学教育出版生态继续延伸。[原文](https://www.esph.com.cn/jkzx/8d27c5c32f8d4ad1b6aa05636646f73e.htm)',
  ],
  '2026-W33': [
    '- **山东出版集团举办首届"数智领航 实干争先"科技创新擂台赛**：出版集团以赛事机制推动数智化转型，教育出版数字化项目孵化加速。[原文](https://www.sdpress.com.cn/News/1/104/NewsDetail_11445_1.html)',
  ],
  '2026-W34': [
    '- **苏教版小学数学新教材培训在贵阳开幕**：秋季学期新教材使用培训大范围落地，教材配套培训与教研服务成为发行单位的刚需动作。[原文](https://www.ppm.cn/index.php/Article/index?id=12628)',
    '- **苏教版小学科学新教材培训会在成都举办**：凤凰传媒同步推进科学新教材省级培训，新教材推广服务体系覆盖多省。[原文](https://www.ppm.cn/index.php/Article/index?id=12625)',
    '- **山东出版集团开展"刊润童心"少儿阅读推广活动**：集团工会联合山东省图书馆、明天出版社推动少儿阅读，教育出版与阅读推广协同。[原文](https://www.sdpress.com.cn/News/1/102/NewsDetail_11472_1.html)',
  ],
  '2026-W35': [
    '- **学习贯彻习近平总书记给人教社老同志重要回信五周年座谈会举行**：中国教育出版传媒集团系统重温回信精神，教材教辅出版的国家事权定位进一步强化。[原文](https://www.cepmg.com.cn/xwzx/jtdt/202608/t20260825_2007613.html)',
    '- **凤凰传媒15个项目入选2026年度国家出版基金**：入选数量居全国出版集团第三，教育出版精品立项能力获得权威认可。[原文](https://www.ppm.cn/index.php/Article/index?id=12704)',
  ],
  '2026-W36': [
    '- **人教社多款音像数字产品亮相第十六届中国国际数字出版博览会**：人教社数字教材、音视频与智能产品集中展出，教育出版数字化成果密集展示。[原文](https://www.pep.com.cn/rjdt/rjdt/202608/t20260831_2007829.shtml)',
    '- **山东出版集团亮相数字出版博览会**："数智赋能出版 合作共谱新篇"，地方出版集团同步展示融合出版新业态布局。[原文](https://www.sdpress.com.cn/News/1/104/NewsDetail_11503_1.html)',
  ],
  '2026-W37': [
    '- **新华社评述打造培根铸魂、启智增慧的精品教材**：新华社文章系统阐述高质量教材体系建设进展，教材教辅编研出版的精品化导向更加清晰。[原文](https://www.pep.com.cn/rjdt/mtbd/202609/t20260908_2008076.shtml)',
    '- **凤凰数智产品矩阵赋能融合出版新业态**：凤凰传媒参展中国国际数字出版博览会，数智产品矩阵覆盖内容生产、教育与知识服务环节。[原文](https://www.ppm.cn/index.php/Article/index?id=12718)',
  ],
  '2026-W38': [
    '- **怀进鹏调研"中国共产党领导的教材建设成就展"**：教育部部长调研教材建设成就展，强调教材是国家事权，教材编研出版与资源建设方向获得权威指引。[原文](https://www.cepmg.com.cn/xwzx/jtdt/202609/t20260918_2008185.html)',
  ],
  '2026-W39': [
    '- **中国教育出版传媒集团召开数智化推进会**：集团公司专题部署数智化工作，旗下教材教辅出版机构的数字化升级进入集团统筹推进阶段。[原文](https://www.cepmg.com.cn/xwzx/jtdt/202609/t20260921_2008248.html)',
    '- **山东新华书店集团启动全省"秋阅知丰季"主题活动**：秋季发行旺季主题营销铺开，教辅图书与阅读服务的渠道活动同步上新。[原文](https://www.sdpress.com.cn/News/1/102/NewsDetail_11559_1.html)',
  ],
};

const NEXT_HEADING_RE = /^## /m;
for (const [week, items] of Object.entries(additions)) {
  const file = `weekly/${week}-周报.md`;
  let md = fs.readFileSync(file, 'utf8');
  const block = `\n${items.join('\n')}\n`;
  const h3Index = md.indexOf(H3);
  if (h3Index >= 0) {
    const afterH3 = md.slice(h3Index + H3.length);
    const m = NEXT_HEADING_RE.exec(afterH3);
    const insertAt = h3Index + H3.length + (m ? m.index : afterH3.length);
    md = md.slice(0, insertAt).replace(/\s*$/, '') + block + md.slice(insertAt).replace(/^\s+/, m ? '' : '');
    // normalize: ensure blank line between last existing bullet and new block handled above
  } else {
    // find first existing section heading after header lines
    const headings = [...md.matchAll(/^## .+$/gm)];
    if (headings.length) {
      const first = headings[0];
      md = md.slice(0, first.index) + `${H3}\n${items.join('\n')}\n\n` + md.slice(first.index);
    } else {
      md = md.trimEnd() + `\n\n${H3}\n${items.join('\n')}\n`;
    }
  }
  fs.writeFileSync(file, md, 'utf8');
  console.log(`${week}: +${items.length}`);
}
console.log('done');
