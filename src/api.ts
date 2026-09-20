import type { Session, Evidence } from '../shared/types';

const KEY = 'receiverright.workspace.v1';
export function readSession(): Session | null {
  try { const value = JSON.parse(localStorage.getItem(KEY) || 'null'); return value?.token && value?.workspaceId ? value : null; } catch { return null; }
}
export function storeSession(session: Session) { localStorage.setItem(KEY, JSON.stringify(session)); }
export function validateUpload(file: File, kind: 'invoice' | 'photo' = 'invoice') {
  if (file.size < 8 || file.size > 5 * 1024 * 1024) throw new Error('Choose a nonempty file no larger than 5 MB.');
  const allowed = kind === 'invoice' ? ['image/jpeg', 'image/png', 'application/pdf'] : ['image/jpeg', 'image/png'];
  if (!allowed.includes(file.type)) throw new Error(kind === 'invoice' ? 'Choose a JPG, PNG image or PDF.' : 'Choose a JPG or PNG delivery photograph.');
}
export class ApiError extends Error {
  status: number; code?: string; details?: unknown;
  constructor(message: string, status: number, code?: string, details?: unknown) { super(message); this.status = status; this.code = code; this.details = details; }
}
export async function api<T>(path: string, options: RequestInit = {}, token = readSession()?.token): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof Blob)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`/api${path}`, { ...options, headers });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: `Request failed (${response.status}). Please try again.` }));
    throw new ApiError(error.error || 'Something went wrong. Please try again.', response.status, error.code, error.details);
  }
  return response.json();
}
export function post<T>(path: string, body: unknown = {}, token?: string) { return api<T>(path, { method: 'POST', body: JSON.stringify(body) }, token); }
export async function uploadFile(caseId: string, file: File, kind: 'invoice' | 'photo', lineId?: string) {
  validateUpload(file, kind);
  const result = await post<{ uploadId: string; uploadUrl: string; method: 'PUT'; headers: Record<string, string> }>('/uploads', { caseId, fileName: file.name, mimeType: file.type, kind, lineId, size: file.size });
  const response = await fetch(result.uploadUrl, { method: result.method, headers: result.headers, body: file });
  if (!response.ok) throw new Error('Your file did not finish uploading. Please retry.');
  return post<Evidence>(`/uploads/${result.uploadId}/complete`);
}
export async function downloadCase(id: string, format: 'json' | 'csv') {
  const response = await fetch(`/api/cases/${id}/export?format=${format}`, { headers: { Authorization: `Bearer ${readSession()?.token}` } });
  if (!response.ok) throw new Error('Export could not be downloaded. Please try again.');
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a'); link.href = url; link.download = `receiverright-${id}.${format}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const money = (minor: number | null | undefined) => minor == null ? 'Unpriced' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: minor % 100 ? 2 : 0 }).format(minor / 100);
export const date = (value: string, time = false) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', ...(time ? { hour: 'numeric', minute: '2-digit' } : {}) }).format(new Date(value));
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
