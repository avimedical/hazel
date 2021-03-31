// Native
const path = require('path')

module.exports = fileName => {
  const extension = path.extname(fileName).slice(1)

  if (
    (fileName.includes('mac') || fileName.includes('darwin')) &&
    extension === 'yml'
  ) {
    return 'darwin'
  }

  if (extension === 'yml') {
    return 'win32'
  }

  if (fileName.includes('dmg') && extension === 'blockmap') {
    return 'darwin-blockmap'
  }

  if (extension === 'blockmap') {
    return 'win32-blockmap'
  }

  const directCache = ['exe', 'dmg', 'rpm', 'deb', 'AppImage', 'zip']
  return directCache.find(ext => ext === extension) || false
}
