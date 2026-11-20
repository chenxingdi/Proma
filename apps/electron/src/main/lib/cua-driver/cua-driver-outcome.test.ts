import { describe, expect, test } from 'bun:test'
import { compareVersions, resolveInstallOutcome } from './cua-driver-outcome'

describe('compareVersions 版本比较', () => {
  test('Given 相同版本 When 比较 Then 返回 0', () => {
    expect(compareVersions('0.55.0', '0.55.0')).toBe(0)
  })

  test('Given 更高版本 When 比较 Then 返回正数', () => {
    expect(compareVersions('0.55.0', '0.47.7')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '0.99.99')).toBeGreaterThan(0)
    expect(compareVersions('0.19.10', '0.19.9')).toBeGreaterThan(0)
  })

  test('Given 更低版本 When 比较 Then 返回负数', () => {
    expect(compareVersions('0.47.7', '0.55.0')).toBeLessThan(0)
  })

  test('Given 无法解析的版本 When 比较 Then 返回 0', () => {
    expect(compareVersions('unknown', '0.55.0')).toBe(0)
  })
})

describe('resolveInstallOutcome 更新结果判定', () => {
  test('Given 安装器报错但磁盘已是目标版本 When 判定 Then 视为成功并提示重启 daemon', () => {
    // 复现本次真实故障：0.47.7 -> 0.55.0，安装器因 stale daemon 返回错误，但二进制已替换。
    const result = resolveInstallOutcome({
      targetVersion: '0.55.0',
      currentVersion: '0.47.7',
      installedVersion: '0.55.0',
      installerError: 'daemon is stale: pipe not accepting connections',
      installerSucceeded: false,
    })

    expect(result.updated).toBe(true)
    expect(result.version).toBe('0.55.0')
    expect(result.previousVersion).toBe('0.47.7')
    expect(result.daemonRestartNeeded).toBe(true)
    expect(result.message).toContain('重启 daemon')
  })

  test('Given 磁盘版本高于目标版本 When 判定 Then 视为成功', () => {
    const result = resolveInstallOutcome({
      targetVersion: '0.55.0',
      currentVersion: '0.47.7',
      installedVersion: '0.56.0',
      installerSucceeded: true,
    })

    expect(result.updated).toBe(true)
    expect(result.version).toBe('0.56.0')
    expect(result.daemonRestartNeeded).toBe(false)
  })

  test('Given 安装器成功但读不到版本 When 判定 Then 仍视为成功并使用目标版本', () => {
    const result = resolveInstallOutcome({
      targetVersion: '0.55.0',
      currentVersion: '0.47.7',
      installedVersion: '',
      installerSucceeded: true,
    })

    expect(result.updated).toBe(true)
    expect(result.version).toBe('0.55.0')
    expect(result.daemonRestartNeeded).toBe(false)
  })

  test('Given 安装器报错且版本未变 When 判定 Then 视为失败并返回原始错误', () => {
    const result = resolveInstallOutcome({
      targetVersion: '0.55.0',
      currentVersion: '0.47.7',
      installedVersion: '0.47.7',
      installerError: 'network timeout',
      installerSucceeded: false,
    })

    expect(result.updated).toBe(false)
    expect(result.version).toBe('')
    expect(result.message).toContain('network timeout')
  })

  test('Given 安装器报错且读不到版本 When 判定 Then 视为失败并使用兜底错误文案', () => {
    const result = resolveInstallOutcome({
      targetVersion: '0.55.0',
      currentVersion: '0.47.7',
      installedVersion: '',
      installerSucceeded: false,
    })

    expect(result.updated).toBe(false)
    expect(result.message).toBe('Cua Driver 更新失败')
  })
})
