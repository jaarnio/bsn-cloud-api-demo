import { useState } from 'react'
import { PlayerSelect } from '../PlayerSelect'
import { PasswordInput } from '../PasswordInput'
import {
  rebootPlayer,
  getDwsPassword,
  setDwsPassword,
  getLocalDws,
  setLocalDws,
} from '../../api/client'
import type { DwsPasswordResponse, LocalDwsResponse, TraceEntry } from '../../types'

type Target = { network: string; serial: string }
type Busy = 'reboot' | 'pwGet' | 'pwSet' | 'dwsGet' | 'dwsSet' | null

export function ControlPanel({ onTrace }: { onTrace: (trace: TraceEntry[]) => void }) {
  const [target, setTarget] = useState<Target | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [pwStatus, setPwStatus] = useState<DwsPasswordResponse['result'] | null>(null)
  const [newPw, setNewPw] = useState('')
  const [prevPw, setPrevPw] = useState('')

  const [localDws, setLocalDwsState] = useState<boolean | null>(null)
  const [enable, setEnable] = useState(true)

  function onSelect(network: string, serial: string | null) {
    setTarget(serial ? { network, serial } : null)
    setError(null)
    setNotice(null)
    setPwStatus(null)
    setNewPw('')
    setPrevPw('')
    setLocalDwsState(null)
  }

  // Wrap an action with shared busy/error/notice handling.
  async function run(kind: Busy, fn: () => Promise<void>) {
    setBusy(kind)
    setError(null)
    setNotice(null)
    try {
      await fn()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function doReboot() {
    if (!target) return
    if (!window.confirm(`Reboot "${target.serial}"? The player will restart now.`)) return
    await run('reboot', async () => {
      const res = await rebootPlayer(target.serial, target.network)
      onTrace(res.trace)
      setNotice(`Reboot command sent to "${target.serial}".`)
    })
  }

  async function checkPassword() {
    if (!target) return
    await run('pwGet', async () => {
      const res = await getDwsPassword(target.serial, target.network)
      onTrace(res.trace)
      setPwStatus(res.result)
    })
  }

  async function savePassword() {
    if (!target || !newPw) return
    if (!window.confirm(`Set the DWS password on "${target.serial}"? This may reboot the player.`)) return
    await run('pwSet', async () => {
      const res = await setDwsPassword(target.serial, target.network, newPw, prevPw)
      onTrace(res.trace)
      setNotice('DWS password updated (the player may reboot).')
      setNewPw('')
      setPrevPw('')
      setPwStatus(null)
    })
  }

  async function checkLocalDws() {
    if (!target) return
    await run('dwsGet', async () => {
      const res: LocalDwsResponse = await getLocalDws(target.serial, target.network)
      onTrace(res.trace)
      const value = Boolean(res.result?.value)
      setLocalDwsState(value)
      setEnable(value)
    })
  }

  async function applyLocalDws() {
    if (!target) return
    if (
      !window.confirm(
        `${enable ? 'Enable' : 'Disable'} the local DWS on "${target.serial}"? This reboots the player.`,
      )
    ) {
      return
    }
    await run('dwsSet', async () => {
      const res = await setLocalDws(target.serial, target.network, enable)
      onTrace(res.trace)
      setNotice(`Local DWS ${enable ? 'enabled' : 'disabled'} — the player is rebooting.`)
      setLocalDwsState(null)
    })
  }

  return (
    <div className="fn-pane rdws">
      <h2>Control</h2>
      <p className="muted small">
        Reboot the player, manage the DWS password, and toggle the local DWS — via Remote DWS.
      </p>

      <PlayerSelect onTrace={onTrace} onSelect={onSelect} />

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {!target ? (
        <p className="muted">Select an online player to continue.</p>
      ) : (
        <>
          <section>
            <h3>Reboot</h3>
            <div className="rdws-actions">
              <button className="btn-danger" onClick={doReboot} disabled={busy !== null}>
                {busy === 'reboot' ? 'Sending…' : 'Reboot player'}
              </button>
            </div>
            <p className="muted tiny">Restarts the player immediately.</p>
          </section>

          <section>
            <h3>DWS password</h3>
            <div className="rdws-actions">
              <button onClick={checkPassword} disabled={busy !== null}>
                {busy === 'pwGet' ? 'Checking…' : 'Check status'}
              </button>
              {pwStatus && (
                <span className={`pill ${pwStatus.password?.isBlank === false ? 'pill-on' : 'pill-muted'}`}>
                  {pwStatus.password?.isBlank === false ? 'Password set' : 'No password set'}
                </span>
              )}
            </div>
            <p className="muted tiny">
              The API reports only whether a password is set — it never returns the password. Setting
              a password may reboot the player.
            </p>

            <label className="rdws-label">
              New password
              <PasswordInput value={newPw} onChange={setNewPw} placeholder="new DWS password" />
            </label>
            <label className="rdws-label">
              Previous password (if one is set)
              <PasswordInput value={prevPw} onChange={setPrevPw} placeholder="current password" />
            </label>
            <div className="rdws-actions">
              <button onClick={savePassword} disabled={busy !== null || !newPw}>
                {busy === 'pwSet' ? 'Saving…' : 'Set password'}
              </button>
            </div>
          </section>

          <section>
            <h3>Local DWS</h3>
            <div className="rdws-actions">
              <button onClick={checkLocalDws} disabled={busy !== null}>
                {busy === 'dwsGet' ? 'Checking…' : 'Check status'}
              </button>
              {localDws !== null && (
                <span className={`pill ${localDws ? 'pill-on' : 'pill-off'}`}>
                  {localDws ? 'Enabled' : 'Disabled'}
                </span>
              )}
            </div>
            <label className="checkbox">
              <input type="checkbox" checked={enable} onChange={(e) => setEnable(e.target.checked)} />
              Enable local DWS
            </label>
            <div className="rdws-actions">
              <button onClick={applyLocalDws} disabled={busy !== null}>
                {busy === 'dwsSet' ? 'Applying…' : 'Apply'}
              </button>
            </div>
            <p className="muted tiny">Changing the local DWS reboots the player.</p>
          </section>
        </>
      )}
    </div>
  )
}
