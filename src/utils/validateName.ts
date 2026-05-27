const BANNED_WORDS = [
  '管理员', 'admin', 'root', '测试', 'test', '老师',
  '习近平', '毛泽东', '邓小平', '江泽民', '胡锦涛', '温家宝', '李克强',
  '反动', '颠覆', '煽动', '分裂', '叛乱',
  'nigger', 'spic', 'kike', 'chink', 'paki', 'negro',
  'fag', 'faggot', 'dyke', 'queer',
  '回回', '靴子', '高丽棒子', '老毛子', '黑鬼', '杂种', '东亚病夫', '蛮夷',
  '洋鬼子', '小日本', '大汉族主义', '印度阿三', '乡巴佬',
  '大男人', '小女人', '男尊女卑', '重男轻女', '血统',
  '臭婆娘', '死老娘们儿', '娘娘腔', '伪娘',
  'fuck', 'shit', 'bitch', 'cunt', 'piss', 'asshole', 'cock', 'dick', 'tits', 'balls', 'ass',
  'damn', 'hell', 'bastard', 'jerk', 'moron', 'idiot', 'retard', 'motherfucker',
  'sb', '傻逼', '操', '他妈', '你妈', '你妹', '日了狗', '日你妈', '草泥马', '特么的', '妈蛋',
  '装逼', '撕逼', '呆逼', '逗比', '傻逼',
  '玛拉戈壁', '爆菊', 'JB', '本屌', '齐B短裙', '法克鱿', '丢你老母', '达菲鸡',
  '装13', '逼格', '蛋疼', '绿茶婊', '表砸', '屌爆了', '买了个婊', '已撸', '吉跋猫',
  '碧莲', '碧池', '然并卵', '屁民', '吃翔', 'XX狗', '淫家', '浮尸国', '滚粗', '我靠',
  '笨蛋', '傻瓜', '废物', '垃圾', '脑残', '神经病', '变态',
  '王八蛋', '龟儿子', '狗东西', '猪头', '驴脸',
  '去死吧', '见鬼去', '滚开',
  '杀人', '放火', '爆炸', '自残', '虐待',
  '性交', '做爱', '勃起', '乳房', '阴道',
  '吸毒', '贩毒', '赌博', '赌场', '博彩',
  '亵渎神灵', '侮辱佛祖', '诋毁耶稣', '邪教组织',
];

export function validatePetName(name: string, existingNames?: string[]): string | null {
  if (!name.trim()) return '请输入名字';
  if (name.length < 2) return '名字至少 2 个字';
  if (name.length > 8) return '名字最多 8 个字';
  if (!/^[一-龥a-zA-Z0-9]+$/.test(name)) return '只能使用中文、英文和数字';
  for (const w of BANNED_WORDS) {
    if (name.toLowerCase().includes(w.toLowerCase())) return '名字包含敏感词';
  }
  if (existingNames && existingNames.includes(name.trim())) return '名字已被其他智子使用';
  return null;
}
