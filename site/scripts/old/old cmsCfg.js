// site specific CMS configuration

var cmsLiteCfg = {
  auth: 'cms',  // only used to configure interface
  copyright: '&copy; 2020 Enchanted Engineering',
  debug: false,
  folders: {  // content folders relative to document root for uploads
    data: '/data',
    docs: '/docs',
    images: '/images',
    media: '/media',
    pics: '/media/pics',
    schema: '/schema',
    videos: '/media/videos'
  },
  publish: {
    backup: true,
    pretty: true,
    series: '$u-p$p4-$v.json'
  },
  urls: {
    list: '/.',
    live: 'https://talkingcoyotes.net',
    preview: '',
    publish: '/',
    upload: '/'
  },
  version: '20200831v1Lite'
};
