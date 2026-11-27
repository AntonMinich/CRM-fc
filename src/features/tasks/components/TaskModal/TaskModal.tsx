/**
 * Окно «Создать задачу»: название, срок, описание и ответственный.
 * Открывается из раздела «Задачи» и из всплывающей карточки взаимодействия.
 */

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { fetchResponsibleUsers } from '../../../clients/api/clientsApi';
import type { ResponsibleUser } from '../../../clients/types';
import type { Interaction } from '../../../interactions/types';
import {
  counterpartyOf,
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
} from '../../../interactions/utils/interactionDisplay';
import { TaskApiError, createTask } from '../../api/tasksApi';
import { TASK_DEFAULT_LEAD_MS, TASK_LIMITS } from '../../config/taskFields';
import '../../../clients/components/ClientForm/ClientForm.css';

interface TaskModalProps {
  open: boolean;
  /** Взаимодействие, из которого создаётся задача: контрагент и ответственный. */
  interaction?: Interaction | null;
  onClose: () => void;
  onCreated: () => void;
}

/** Название по умолчанию: «Отразить результат встречи с <Контрагент>». */
function defaultTitle(interaction: Interaction | null): string {
  if (!interaction) return '';
  const name = counterpartyOf(interaction).name;
  return name ? `Отразить результат встречи с ${name}` : 'Отразить результат встречи';
}

/** Срок по умолчанию: текущее время плюс час. */
function defaultDue(): string {
  return toDateTimeLocalValue(new Date(Date.now() + TASK_DEFAULT_LEAD_MS).toISOString());
}

export function TaskModal({ open, interaction = null, onClose, onCreated }: TaskModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(defaultDue);
  const [description, setDescription] = useState('');
  const [responsible, setResponsible] = useState('');
  const [users, setUsers] = useState<ResponsibleUser[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // При открытии поля заполняются заново: из карточки — по взаимодействию.
  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle(interaction));
    setDue(defaultDue());
    setDescription('');
    setResponsible(interaction?.responsibleUserId ?? '');
    setErrors({});
    setFormError(null);
    setSubmitting(false);
  }, [open, interaction]);

  // Справочник ответственных нужен только при создании из раздела.
  useEffect(() => {
    if (!open || interaction) return;
    const controller = new AbortController();
    void fetchResponsibleUsers(controller.signal)
      .then((list) => setUsers(list))
      .catch(() => setUsers([]));
    return () => controller.abort();
  }, [open, interaction]);

  // Нативный <dialog>: открытие и закрытие окна.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    const trimmedTitle = title.trim();
    if (trimmedTitle === '') nextErrors.title = 'Введите название';
    else if (trimmedTitle.length > TASK_LIMITS.title) {
      nextErrors.title = `Не более ${TASK_LIMITS.title} символов`;
    }

    const dueIso = fromDateTimeLocalValue(due);
    if (!dueIso) nextErrors.due = 'Укажите срок выполнения';
    else if (Date.parse(dueIso) < Date.now() - 60_000) {
      nextErrors.due = 'Срок не может быть в прошлом';
    }

    const trimmedDescription = description.trim();
    if (trimmedDescription.length > TASK_LIMITS.description) {
      nextErrors.description = `Не более ${TASK_LIMITS.description} символов`;
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !dueIso) return;

    setSubmitting(true);
    setFormError(null);
    try {
      await createTask({
        title: trimmedTitle,
        due_at: dueIso,
        description: trimmedDescription === '' ? null : trimmedDescription,
        ...(responsible ? { responsible_user_id: responsible } : {}),
        ...(interaction ? { interaction_id: interaction.id } : {}),
      });
      onCreated();
    } catch (error) {
      if (error instanceof TaskApiError && error.fieldErrors) {
        setErrors({
          title: error.fieldErrors.title ?? '',
          due: error.fieldErrors.due_at ?? '',
          description: error.fieldErrors.description ?? '',
        });
      }
      setFormError(error instanceof Error ? error.message : 'Не удалось создать задачу');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="client-modal"
      aria-labelledby="task-modal-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <button
        type="button"
        className="client-modal__close"
        aria-label="Закрыть"
        onClick={onClose}
        disabled={submitting}
      >
        ×
      </button>

      <h2 className="client-modal__title" id="task-modal-title">
        Создать задачу
      </h2>

      <form className="client-form" onSubmit={handleSubmit} noValidate>
        <div className="client-form__fields client-form__fields--main">
          <label className="client-field client-field--span-4" htmlFor="task-title">
            <span className="client-field__label">
              Название <span className="client-field__required">*</span>
            </span>
            <input
              id="task-title"
              className="client-field__input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={TASK_LIMITS.title}
              required
              aria-required="true"
              aria-invalid={Boolean(errors.title)}
              disabled={submitting}
            />
            {errors.title ? <span className="client-field__error">{errors.title}</span> : null}
          </label>

          <label className="client-field client-field--span-2" htmlFor="task-due">
            <span className="client-field__label">
              Срок выполнения <span className="client-field__required">*</span>
            </span>
            <input
              id="task-due"
              className="client-field__input"
              type="datetime-local"
              value={due}
              onChange={(event) => setDue(event.target.value)}
              required
              aria-required="true"
              aria-invalid={Boolean(errors.due)}
              disabled={submitting}
            />
            {errors.due ? <span className="client-field__error">{errors.due}</span> : null}
          </label>

          {interaction ? null : (
            <label className="client-field client-field--span-6" htmlFor="task-responsible">
              <span className="client-field__label">Ответственный</span>
              <select
                id="task-responsible"
                className="client-field__input"
                value={responsible}
                onChange={(event) => setResponsible(event.target.value)}
                disabled={submitting || users.length === 0}
              >
                <option value="">По умолчанию</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="client-field client-field--span-6" htmlFor="task-description">
            <span className="client-field__label">Описание</span>
            <textarea
              id="task-description"
              className="client-field__input client-field__textarea client-field__textarea--compact"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              maxLength={TASK_LIMITS.description}
              disabled={submitting}
            />
            {errors.description ? (
              <span className="client-field__error">{errors.description}</span>
            ) : null}
          </label>
        </div>

        {formError ? (
          <p className="client-form__error" role="alert">
            {formError}
          </p>
        ) : null}

        <div className="client-form__actions">
          <button
            type="button"
            className="client-button client-button--secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Отмена
          </button>
          <button type="submit" className="client-button client-button--primary" disabled={submitting}>
            {submitting ? 'Сохранение…' : 'Создать'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
