"use client";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { ActionResult } from "@/server/action";
import { Button, type ButtonProps } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Input, Label, Select, Textarea } from "./ui/input";
import { cn } from "@/lib/utils";

type ServerAction = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

const ErrorsCtx = React.createContext<Record<string, string>>({});

export function SubmitButton({ children, pendingText, ...props }: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending && <Loader2 className="animate-spin" />}
      {pending ? pendingText ?? "Saving…" : children}
    </Button>
  );
}

export function ActionForm({
  action, children, className, submitLabel = "Save", submitVariant, resetOnSuccess, onSuccess, hideSubmit, confirmText, refresh = true,
}: {
  action: ServerAction; children: React.ReactNode; className?: string; submitLabel?: string;
  submitVariant?: ButtonProps["variant"]; resetOnSuccess?: boolean; onSuccess?: (r: ActionResult) => void;
  hideSubmit?: boolean; confirmText?: string; refresh?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const formRef = React.useRef<HTMLFormElement>(null);
  const router = useRouter();
  const lastState = React.useRef<ActionResult | null>(null);

  React.useEffect(() => {
    if (!state || state === lastState.current) return;
    lastState.current = state;
    if (state.ok) {
      if (state.message) toast.success(state.message);
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.(state);
      if (state.redirect) router.push(state.redirect);
      else if (refresh) router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, resetOnSuccess, onSuccess, router, refresh]);

  return (
    <ErrorsCtx.Provider value={state && !state.ok ? state.fieldErrors ?? {} : {}}>
      <form
        ref={formRef}
        action={formAction}
        className={cn("space-y-4", className)}
        onSubmit={(e) => {
          if (confirmText && !window.confirm(confirmText)) e.preventDefault();
        }}
      >
        {children}
        {state && !state.ok && state.error && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>
        )}
        {!hideSubmit && (
          <div className="flex justify-end">
            <SubmitButton variant={submitVariant}>{submitLabel}</SubmitButton>
          </div>
        )}
      </form>
    </ErrorsCtx.Provider>
  );
}

/** Button that opens a dialog containing an ActionForm; closes on success. */
export function FormDialog({
  trigger, title, description, action, children, submitLabel, wide, triggerVariant = "default", triggerSize,
}: {
  trigger: React.ReactNode; title: string; description?: string; action: ServerAction; children: React.ReactNode;
  submitLabel?: string; wide?: boolean; triggerVariant?: ButtonProps["variant"]; triggerSize?: ButtonProps["size"];
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={title}
      description={description}
      wide={wide}
      trigger={<Button variant={triggerVariant} size={triggerSize}>{trigger}</Button>}
    >
      <ActionForm action={action} submitLabel={submitLabel} onSuccess={() => setOpen(false)}>
        {children}
      </ActionForm>
    </Dialog>
  );
}

/** A one-click action (with confirmation) carrying hidden fields. */
export function ConfirmAction({
  action, fields, label, confirm, variant = "outline", size = "sm", icon,
}: {
  action: ServerAction; fields: Record<string, string>; label: string; confirm?: string;
  variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; icon?: React.ReactNode;
}) {
  return (
    <ActionForm action={action} hideSubmit confirmText={confirm} className="inline-block space-y-0">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <SubmitButton variant={variant} size={size} pendingText="…">{icon}{label}</SubmitButton>
    </ActionForm>
  );
}

type FieldProps = { label: string; name: string; required?: boolean; hint?: string; className?: string };

export function Field({ label, name, required, hint, className, children }: FieldProps & { children: React.ReactNode }) {
  const errors = React.useContext(ErrorsCtx);
  const err = errors[name];
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={name}>
        {label} {required && <span className="text-red-600">*</span>}
      </Label>
      {children}
      {err ? <p className="text-xs text-red-600">{err}</p> : hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function TextField({ label, name, required, hint, className, ...rest }: FieldProps & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} name={name} required={required} hint={hint} className={className}>
      <Input id={name} name={name} required={required} {...rest} />
    </Field>
  );
}

export function TextAreaField({ label, name, required, hint, className, ...rest }: FieldProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} name={name} required={required} hint={hint} className={className}>
      <Textarea id={name} name={name} required={required} {...rest} />
    </Field>
  );
}

export function SelectField({
  label, name, required, hint, className, options, placeholder, ...rest
}: FieldProps & React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <Field label={label} name={name} required={required} hint={hint} className={className}>
      <Select id={name} name={name} required={required} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </Field>
  );
}

export function CheckboxField({ label, name, defaultChecked, hint }: { label: string; name: string; defaultChecked?: boolean; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm text-slate-700">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700" />
      <span>
        {label}
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

export function Grid({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  const c = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols];
  return <div className={cn("grid grid-cols-1 gap-4", c)}>{children}</div>;
}
