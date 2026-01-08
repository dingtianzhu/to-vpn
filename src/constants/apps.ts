/**
 * 应用预设数据
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 7.7**
 * 
 * 提供预设应用组，方便用户快速配置分应用代理
 */

/**
 * 应用预设组接口
 */
export interface AppPresetGroup {
  /** 组 ID */
  id: string
  /** 组名称（中文） */
  nameZh: string
  /** 组名称（英文） */
  nameEn: string
  /** 组描述（中文） */
  descZh: string
  /** 组描述（英文） */
  descEn: string
  /** 组图标 */
  icon: string
  /** 应用列表（进程名） */
  apps: string[]
}

/**
 * 中国应用预设组
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 7.7**
 * 
 * 包含常见的中国应用，这些应用通常需要直连以获得最佳体验
 */
export const CHINESE_APPS: AppPresetGroup = {
  id: 'chinese-apps',
  nameZh: '中国应用',
  nameEn: 'Chinese Apps',
  descZh: '微信、QQ、钉钉等国内应用',
  descEn: 'WeChat, QQ, DingTalk and other Chinese apps',
  icon: '🇨🇳',
  apps: [
    // 即时通讯
    'WeChat',
    'QQ',
    '钉钉',
    'DingTalk',
    '企业微信',
    'WeCom',
    '飞书',
    'Feishu',
    'Lark',
    '腾讯会议',
    'TencentMeeting',
    // 支付
    '支付宝',
    'Alipay',
    // 音乐
    '网易云音乐',
    'NeteaseMusic',
    'QQ音乐',
    'QQMusic',
    '酷狗音乐',
    'KuGou',
    '酷我音乐',
    'KuWo',
    // 视频
    '爱奇艺',
    'iQIYI',
    '优酷',
    'Youku',
    '腾讯视频',
    'TencentVideo',
    '哔哩哔哩',
    'bilibili',
    // 购物
    '淘宝',
    'Taobao',
    '京东',
    'JD',
    '拼多多',
    'Pinduoduo',
    // 外卖
    '美团',
    'Meituan',
    '饿了么',
    'Eleme',
    // 出行
    '滴滴出行',
    'DiDi',
    '高德地图',
    'Amap',
    '百度地图',
    'BaiduMap',
    // 办公
    'WPS Office',
    'WPSOffice',
    // 浏览器
    '360安全浏览器',
    '360浏览器',
    'QQ浏览器',
    'QQBrowser',
  ],
}

/**
 * 游戏应用预设组
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 7.7**
 * 
 * 包含常见的游戏平台和游戏客户端
 */
export const GAMING_APPS: AppPresetGroup = {
  id: 'gaming',
  nameZh: '游戏',
  nameEn: 'Gaming',
  descZh: 'Steam、Epic、暴雪等游戏平台',
  descEn: 'Steam, Epic, Blizzard and other gaming platforms',
  icon: '🎮',
  apps: [
    // 游戏平台
    'Steam',
    'steam',
    'steamwebhelper',
    'Epic Games Launcher',
    'EpicGamesLauncher',
    'EpicWebHelper',
    'Battle.net',
    'Blizzard Battle.net',
    'Origin',
    'EA',
    'EADesktop',
    'Ubisoft Connect',
    'UbisoftConnect',
    'upc',
    'GOG Galaxy',
    'GOGGalaxy',
    // 国内游戏平台
    'WeGame',
    'wegame',
    // 游戏加速器
    'UU加速器',
    'UUBooster',
    '迅游加速器',
    'Xunyou',
    '雷神加速器',
    'LeigodAccelerator',
    // 常见游戏
    'League of Legends',
    'LeagueClient',
    'VALORANT',
    'RiotClientServices',
    'Minecraft',
    'javaw',
    'Genshin Impact',
    'GenshinImpact',
    'YuanShen',
    '原神',
    'Honkai: Star Rail',
    'StarRail',
    '崩坏：星穹铁道',
  ],
}

/**
 * 流媒体应用预设组
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 7.7**
 * 
 * 包含常见的流媒体服务
 */
export const STREAMING_APPS: AppPresetGroup = {
  id: 'streaming',
  nameZh: '流媒体',
  nameEn: 'Streaming',
  descZh: 'Netflix、Spotify、YouTube 等流媒体服务',
  descEn: 'Netflix, Spotify, YouTube and other streaming services',
  icon: '📺',
  apps: [
    // 视频流媒体
    'Netflix',
    'Disney+',
    'DisneyPlus',
    'HBO Max',
    'HBOMax',
    'Amazon Prime Video',
    'PrimeVideo',
    'Hulu',
    'Apple TV',
    'AppleTV',
    'YouTube',
    'YouTubeMusic',
    // 音乐流媒体
    'Spotify',
    'Apple Music',
    'AppleMusic',
    'Tidal',
    'Deezer',
    'Pandora',
    'SoundCloud',
    // 直播平台
    'Twitch',
    'TwitchStudio',
  ],
}

/**
 * 开发工具预设组
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 7.7**
 * 
 * 包含常见的开发工具和 IDE
 */
export const DEVELOPMENT_APPS: AppPresetGroup = {
  id: 'development',
  nameZh: '开发工具',
  nameEn: 'Development',
  descZh: 'Docker、VS Code、终端等开发工具',
  descEn: 'Docker, VS Code, Terminal and other dev tools',
  icon: '💻',
  apps: [
    // 容器和虚拟化
    'Docker',
    'docker',
    'Docker Desktop',
    'com.docker.docker',
    'com.docker.backend',
    'Podman',
    'podman',
    'VirtualBox',
    'VBoxHeadless',
    'VMware Fusion',
    'vmware-vmx',
    'Parallels Desktop',
    'prl_vm_app',
    // IDE 和编辑器
    'Visual Studio Code',
    'Code',
    'code',
    'Cursor',
    'cursor',
    'IntelliJ IDEA',
    'idea',
    'WebStorm',
    'webstorm',
    'PyCharm',
    'pycharm',
    'GoLand',
    'goland',
    'Android Studio',
    'studio',
    'Xcode',
    'Sublime Text',
    'sublime_text',
    'Atom',
    'atom',
    'Vim',
    'vim',
    'Neovim',
    'nvim',
    // 终端
    'Terminal',
    'iTerm',
    'iTerm2',
    'Hyper',
    'Alacritty',
    'alacritty',
    'Warp',
    'warp',
    'kitty',
    // API 工具
    'Postman',
    'postman',
    'Insomnia',
    'insomnia',
    // 数据库工具
    'TablePlus',
    'tableplus',
    'DataGrip',
    'datagrip',
    'DBeaver',
    'dbeaver',
    'Sequel Pro',
    'sequelpro',
    'MongoDB Compass',
    'MongoDBCompass',
    // Git 工具
    'GitHub Desktop',
    'GitHubDesktop',
    'Sourcetree',
    'sourcetree',
    'GitKraken',
    'gitkraken',
    'Tower',
    'tower',
    // 其他开发工具
    'Figma',
    'figma',
    'Sketch',
    'sketch',
    'Charles',
    'charles',
    'Proxyman',
    'proxyman',
  ],
}

/**
 * 社交媒体预设组
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 7.7**
 */
export const SOCIAL_APPS: AppPresetGroup = {
  id: 'social',
  nameZh: '社交媒体',
  nameEn: 'Social Media',
  descZh: 'Twitter、Facebook、Instagram 等社交平台',
  descEn: 'Twitter, Facebook, Instagram and other social platforms',
  icon: '💬',
  apps: [
    'Twitter',
    'X',
    'Facebook',
    'Messenger',
    'Instagram',
    'WhatsApp',
    'Telegram',
    'telegram-desktop',
    'Discord',
    'discord',
    'Slack',
    'slack',
    'Skype',
    'skype',
    'Zoom',
    'zoom.us',
    'Microsoft Teams',
    'Teams',
    'Signal',
    'signal-desktop',
    'Line',
    'LINE',
    'Viber',
    'viber',
    'Snapchat',
    'TikTok',
    'Reddit',
    'LinkedIn',
  ],
}

/**
 * 浏览器预设组
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 7.7**
 */
export const BROWSER_APPS: AppPresetGroup = {
  id: 'browsers',
  nameZh: '浏览器',
  nameEn: 'Browsers',
  descZh: 'Chrome、Firefox、Safari 等浏览器',
  descEn: 'Chrome, Firefox, Safari and other browsers',
  icon: '🌐',
  apps: [
    // 主流浏览器
    'Google Chrome',
    'Chrome',
    'chrome',
    'Google Chrome Helper',
    'Firefox',
    'firefox',
    'Safari',
    'safari',
    'Microsoft Edge',
    'Edge',
    'msedge',
    'Opera',
    'opera',
    'Brave Browser',
    'Brave',
    'brave',
    'Vivaldi',
    'vivaldi',
    'Arc',
    'arc',
    // 国内浏览器
    '360安全浏览器',
    '360浏览器',
    'QQ浏览器',
    'QQBrowser',
    '搜狗浏览器',
    'SogouExplorer',
  ],
}

/**
 * 下载工具预设组
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 7.7**
 */
export const DOWNLOAD_APPS: AppPresetGroup = {
  id: 'download',
  nameZh: '下载工具',
  nameEn: 'Download Tools',
  descZh: '迅雷、百度网盘等下载工具',
  descEn: 'Thunder, Baidu Netdisk and other download tools',
  icon: '⬇️',
  apps: [
    // 国内下载工具
    '迅雷',
    'Thunder',
    'XunLei',
    '百度网盘',
    'BaiduNetdisk',
    '阿里云盘',
    'aDrive',
    '115',
    '115Browser',
    // 国际下载工具
    'qBittorrent',
    'qbittorrent',
    'Transmission',
    'transmission-daemon',
    'uTorrent',
    'utorrent',
    'BitTorrent',
    'bittorrent',
    'Deluge',
    'deluge',
    'Motrix',
    'motrix',
    'Free Download Manager',
    'fdm',
    'aria2',
    'aria2c',
    'wget',
    'curl',
  ],
}

/**
 * 所有预设组列表
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 7.7**
 */
export const APP_PRESET_GROUPS: AppPresetGroup[] = [
  CHINESE_APPS,
  GAMING_APPS,
  STREAMING_APPS,
  DEVELOPMENT_APPS,
  SOCIAL_APPS,
  BROWSER_APPS,
  DOWNLOAD_APPS,
]

/**
 * 根据 ID 获取预设组
 */
export function getPresetGroupById(id: string): AppPresetGroup | undefined {
  return APP_PRESET_GROUPS.find(group => group.id === id)
}

/**
 * 获取预设组名称（根据语言）
 */
export function getPresetGroupName(group: AppPresetGroup, locale: string): string {
  return locale === 'zh' ? group.nameZh : group.nameEn
}

/**
 * 获取预设组描述（根据语言）
 */
export function getPresetGroupDesc(group: AppPresetGroup, locale: string): string {
  return locale === 'zh' ? group.descZh : group.descEn
}
