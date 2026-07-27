const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

module.exports = async function hardenPackagedApplication(context) {
  if (context.electronPlatformName !== 'darwin') return

  const plistPath = join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    'Contents',
    'Info.plist',
  )
  execFileSync('/usr/bin/plutil', [
    '-replace',
    'NSAppTransportSecurity.NSAllowsArbitraryLoads',
    '-bool',
    'NO',
    plistPath,
  ])
  const value = execFileSync(
    '/usr/bin/plutil',
    [
      '-extract',
      'NSAppTransportSecurity.NSAllowsArbitraryLoads',
      'raw',
      plistPath,
    ],
    { encoding: 'utf8' },
  ).trim()
  if (value !== 'false') {
    throw new Error('Packaged application still permits arbitrary network loads.')
  }
}
