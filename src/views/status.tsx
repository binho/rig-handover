import type { Status } from '../status.js';

export function StatusBoard({ status }: { status: Status }) {
  return (
    <>
      <h1>status</h1>
      <table>
        <tbody>
          <tr><th>adapter</th><td>{status.adapter}</td></tr>
          <tr><th>installed</th><td>{status.installed}</td></tr>
          <tr>
            <th>last beat</th>
            <td>{status.lastBeat ? `${status.lastBeat.at} · pid ${status.lastBeat.pid}` : <span class="warn">none</span>}</td>
          </tr>
        </tbody>
      </table>
      <h2>nights on disk</h2>
      {status.nights.length === 0 ? (
        <p class="mute">nothing in runs/</p>
      ) : (
        <ul>
          {status.nights.map((n) => (
            <li>
              <a href={`/digest/${n.night}`}>{n.night}</a>
              {n.counts ? (
                <>
                  {` · ok ${n.counts.ok} · retry ${n.counts.retry} · `}
                  {n.counts.fail > 0 ? <span class="warn">{`fail ${n.counts.fail}`}</span> : `fail ${n.counts.fail}`}
                </>
              ) : (
                ' · —'
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
