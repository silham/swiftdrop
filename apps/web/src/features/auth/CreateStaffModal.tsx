'use client';

import { useState } from 'react';
import { Alert, Button, FormField, Input, Modal, Select } from '@/components/ui';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import type { Role } from '@swiftdrop/contracts';

interface CreateStaffModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateStaffModal({ open, onClose, onCreated }: CreateStaffModalProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(undefined);

    const form = new FormData(e.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const email = String(form.get('email') ?? '').trim();
    const role = String(form.get('role') ?? 'COURIER') as Role;
    const password = String(form.get('password') ?? '');
    const phone = String(form.get('phone') ?? '').trim();

    if (password.length < 8) {
      setPending(false);
      return setError('Password must be at least 8 characters long');
    }

    const { data, error: apiErr } = await api.POST('/api/v1/admin/users', {
      body: {
        name,
        email,
        role,
        password,
        phone: phone || undefined,
      },
    });

    setPending(false);

    if (apiErr || !data) {
      return setError(errorMessage(apiErr, 'Failed to create staff member'));
    }

    onCreated();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Staff Account"
      description="Provision a new employee or administrator"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="create-staff-form" disabled={pending}>
            {pending ? 'Creating…' : 'Create Staff'}
          </Button>
        </>
      }
    >
      <form id="create-staff-form" onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <FormField label="Full name" htmlFor="staff-name">
          <Input
            id="staff-name"
            name="name"
            required
            placeholder="e.g. Chamal Courier"
            data-autofocus
          />
        </FormField>

        <FormField label="Email address" htmlFor="staff-email">
          <Input
            id="staff-email"
            name="email"
            type="email"
            required
            placeholder="staff@swiftdrop.test"
          />
        </FormField>

        <FormField label="Staff role" htmlFor="staff-role">
          <Select id="staff-role" name="role" defaultValue="COURIER">
            <option value="COURIER">Courier (Field delivery & POD)</option>
            <option value="DISPATCHER">Dispatcher (Assignment & Zones)</option>
            <option value="ADMIN">Administrator (Full Access)</option>
          </Select>
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Temporary password" htmlFor="staff-password">
            <Input
              id="staff-password"
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="Minimum 8 characters"
            />
          </FormField>

          <FormField label="Phone number (optional)" htmlFor="staff-phone">
            <Input id="staff-phone" name="phone" type="tel" placeholder="+94770000000" />
          </FormField>
        </div>
      </form>
    </Modal>
  );
}
