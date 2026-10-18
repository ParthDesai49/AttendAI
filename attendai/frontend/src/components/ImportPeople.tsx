import { useRef, useState } from "react";
import { Download, FileUp } from "lucide-react";
import { api } from "../lib/api";
import type { ImportResult } from "../lib/types";
import { useToast } from "./Toast";
import { Button, Modal } from "./ui";

const TEMPLATE = `employee_code,full_name,email,date_of_joining,role,department,designation,work_mode,manager_email,shift,phone,password
EMP101,Anil Kumar,anil@yourcompany.com,2026-04-15,employee,Engineering,Developer,hybrid,manager@attendai.com,General,,
EMP102,Bela Shah,bela@yourcompany.com,2026-04-16,employee,Sales & Support,Support Engineer,office,,,,
`;

function save(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
const quote = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Add many people from a CSV. It first checks the file without saving, then imports. The generated passwords are shown once. */
export function ImportPeople({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const pick = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [check, setCheck] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onFile(f: File | undefined) {
    if (!f) return;
    setFileName(f.name); setCheck(null); setError("");
    setCsv(await f.text());
  }
  async function run(dry: boolean) {
    setBusy(true); setError("");
    try {
      const res = await api.post<ImportResult>("/api/employees/import", { csv, dry_run: dry });
      if (dry) setCheck(res);
      else { setDone(res); onDone(); toast.success(`${res.created.length} ${res.created.length === 1 ? "person" : "people"} added`); }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const passwords = () => save("new-people-passwords.csv", "employee_code,full_name,email,temporary_password\n" +
    (done?.created ?? []).map((c) => [c.employee_code, c.full_name, c.email, c.temp_password].map(quote).join(",")).join("\n") + "\n");

  return (
    <Modal open onClose={onClose} title="Import people from CSV" footer={
      done ? <Button variant="primary" onClick={onClose}>Close</Button> : (
        <>
          <Button onClick={onClose}>Cancel</Button>
          {check && check.created.length > 0
            ? <Button variant="primary" loading={busy} onClick={() => run(false)}>Import {check.created.length} {check.created.length === 1 ? "person" : "people"}</Button>
            : <Button variant="primary" loading={busy} disabled={!csv} onClick={() => run(true)}>Check file</Button>}
        </>
      )
    }>
      {done ? (
        <div className="space-y-4">
          <p className="text-sm">{done.created.length} added{done.errors.length ? `, ${done.errors.length} skipped` : ""}. These temporary passwords are shown <strong>only now</strong>. Save them and share each one with its owner, who should change it under Profile.</p>
          <Button onClick={passwords}><Download className="size-4" aria-hidden /> Download passwords (CSV)</Button>
          <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-lg border border-line text-sm">
            {done.created.map((c) => (<li key={c.row} className="flex justify-between gap-3 px-3 py-2"><span>{c.full_name}</span><code className="select-all">{c.temp_password}</code></li>))}
          </ul>
          {done.errors.length > 0 && <Problems items={done.errors} />}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">Needs the columns <code>employee_code, full_name, email, date_of_joining</code>. Team and shift names must already exist. Leave <code>password</code> empty to have one generated.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => pick.current?.click()}><FileUp className="size-4" aria-hidden /> {fileName || "Choose CSV file"}</Button>
            <Button variant="ghost" onClick={() => save("people-template.csv", TEMPLATE)}><Download className="size-4" aria-hidden /> Download template</Button>
            <input ref={pick} type="file" accept=".csv,text/csv" className="sr-only" aria-label="CSV file" onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
          {error && <p role="alert" className="rounded-lg border border-absent/40 bg-absent/10 px-3 py-2 text-sm">{error}</p>}
          {check && (
            <div className="space-y-2 text-sm" role="status">
              <p className="font-medium">{check.created.length} ready to import{check.errors.length ? `, ${check.errors.length} with problems (skipped)` : ""}.</p>
              {check.errors.length > 0 && <Problems items={check.errors} />}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Problems({ items }: { items: { row: number; message: string }[] }) {
  return (
    <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-absent/40 bg-absent/10 p-3 text-sm">
      {items.map((e) => <li key={e.row}>Row {e.row}: {e.message}</li>)}
    </ul>
  );
}
