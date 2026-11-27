/**
 * Карточка задачи: правка названия, срока и описания, выполнение задачи.
 * Открывается из списка и из канбана раздела «Мои задачи».
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';

import { fetchResponsibleUsers } from '../../../clients/api/clientsApi';
import type { ResponsibleUser } from '../../../clients/types';
import { fetchInteraction } from '../../../interactions/api/interactionsApi';
import { InteractionModal } from '../../../interactions/components/InteractionModal/InteractionModal';
import type { Interaction, InteractionModalMode } from '../../../interactions/types';
import { fetchSupplierContacts } from '../../../suppliers/api/suppliersApi';
import type { SupplierContact } from '../../../suppliers/types';
import {
  formatDateTime,
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
} from '../../../interactions/utils/interactionDisplay';
import { TaskApiError, closeTask, fetchTask, updateTask } from '../../api/tasksApi';
import { TASK_LIMITS, TASK_STATUS_LABELS } from '../../config/taskFields';
import type { Task } from '../../types';
import '../../../clients/components/ClientForm/ClientForm.css';

interface TaskCardModalProps {
  /** Идентификатор открытой задачи; null — окно закрыто. */
  taskId: string | null;
  onClose: () => void;
  /** Список раздела нужно обновить после сохранения или выполнения. */
  onChanged: () => void;
}

/**
 * Окно взаимодействия поверх текущей страницы: переиспользуется карточкой
 * задачи («Связанное взаимодействие») и колокольчиком уведомлений.
 */
export function InteractionOverlay({
  interactionId,
  onClose,
  onSaved,
  onRefresh,
}: {
  interactionId: string | null;
  onClose: () => void;
  /** Изменения после сохранения: раздел обновляет данные. */
  onSaved?: () => void;
  /** Обновление данных без закрытия окна (контакты, список). */
  onRefresh?: () => void;
}) {
  const errorRef = useRef<HTMLDialogElement | null>(null);
  const [interaction, setInteraction] = useState<Interaction | null>(null);
  const [users, setUsers] = useState<ResponsibleUser[]>([]);
  const [contacts, setContacts] = useState<SupplierContact[]>([]);
  const [status, setStatus] = useState<'idle' | 'ready' | 'error'>('idle');
  /** Режим окна: просмотр, правка плана, перенос, результат, отмена. */
  const [mode, setMode] = useState<InteractionModalMode>('view');

  // Запись загружается по идентификатору: владелец определяется её данными.
  useEffect(() => {
    if (!interactionId) {
      setStatus('idle');
      setInteraction(null);
      return;
    }
    const controller = new AbortController();
    setStatus('idle');
    setMode('view');
    void fetchInteraction(interactionId, controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) return;
        setInteraction(loaded);
        setStatus('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error');
      });
    return () => controller.abort();
  }, [interactionId]);

  // Справочник ответственных — как во вкладке взаимодействий.
  useEffect(() => {
    if (!interactionId) return;
    const controller = new AbortController();
    void fetchResponsibleUsers(controller.signal)
      .then((list) => setUsers(list))
      .catch(() => setUsers([]));
    return () => controller.abort();
  }, [interactionId]);

  // Контактные лица нужны только для поставщика.
  useEffect(() => {
    const supplierId = interaction?.supplierId ?? null;
    if (!supplierId) {
      setContacts([]);
      return;
    }
    const controller = new AbortController();
    void fetchSupplierContacts(supplierId, controller.signal)
      .then((page) => setContacts(page.items))
      .catch(() => setContacts([]));
    return () => controller.abort();
  }, [interaction?.supplierId]);

  // Объект удалён или недоступен: краткое сообщение, пользователь остаётся здесь.
  useEffect(() => {
    const dialog = errorRef.current;
    if (!dialog) return;
    if (status === 'error' && !dialog.open) dialog.showModal();
    if (status !== 'error' && dialog.open) dialog.close();
  }, [status]);

  if (status === 'error') {
    return (
      <dialog ref={errorRef} className="client-modal" aria-label="Объект недоступен">
        <h2 className="client-modal__title">Объект недоступен</h2>
        <div className="client-form__actions">
          <button
            type="button"
            className="client-button client-button--secondary"
            onClick={onClose}
          >
            Закрыть
          </button>
        </div>
      </dialog>
    );
  }

  if (status !== 'ready' || !interaction) return null;

  const owner = interaction.supplierId ? 'supplier' : 'client';
  const ownerId = interaction.supplierId ?? interaction.clientId ?? '';

  return createPortal(
    <InteractionModal
      key={interaction.id}
      owner={owner}
      ownerId={ownerId}
      mode={mode}
      interaction={interaction}
      users={users}
      contacts={owner === 'supplier' ? contacts : null}
      currentUserId={users[0]?.id ?? ''}
      onModeChange={setMode}
      onClose={onClose}
      onSaved={onSaved ?? onClose}
      onRefresh={onRefresh ?? (() => undefined)}
    />,
    document.body,
  );
}

type LoadStatus = 'loading' | 'ready' | 'error';

/** Класс бейджа статуса: цвета как у статусов взаимодействий. */
function statusClass(status: string): string {
  if (status === 'overdue') return 'overdue';
  if (status === 'done') return 'done';
  return 'planned';
}

/** Ссылка на карточку контрагента задачи. */
function counterpartyHref(task: Task): string | null {
  if (!task.counterpartyId) return null;
  const section = task.counterpartyType === 'supplier' ? 'suppliers' : 'clients';
  return `/crm/${section}?open=${encodeURIComponent(task.counterpartyId)}`;
}

/** Ссылка на связанное взаимодействие в карточке контрагента. */
function interactionHref(task: Task): string | null {
  if (!task.interactionId) return null;
  const section = task.counterpartyType === 'supplier' ? 'suppliers' : 'clients';
  const params = new URLSearchParams({ tab: 'interactions', interaction: task.interactionId });
  if (task.counterpartyId) params.set('open', task.counterpartyId);
  return `/crm/${section}?${params.toString()}`;
}

export function TaskCardModal({ taskId, onClose, onChanged }: TaskCardModalProps) {
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [task, setTask] = useState<Task | null>(null);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const open = taskId !== null;
  /** «Связанное взаимодействие» открывается поверх карточки задачи. */
  const [linkedOpen, setLinkedOpen] = useState(false);

  // Карточка загружается при открытии.
  useEffect(() => {
    if (!taskId) return;
    const controller = new AbortController();
    setStatus('loading');
    setErrors({});
    setFormError(null);
    setLinkedOpen(false);
    void fetchTask(taskId, controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) return;
        setTask(loaded);
        setTitle(loaded.title);
        setDue(toDateTimeLocalValue(loaded.dueAt));
        setDescription(loaded.description ?? '');
        setStatus('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error');
      });
    return () => controller.abort();
  }, [taskId]);

  // Нативный <dialog>: открытие и закрытие окна.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const isDone = task?.status === 'done';
  /** «Сохранить» активна только при изменениях. */
  const dirty = Boolean(
    task &&
      !isDone &&
      (title !== task.title ||
        description !== (task.description ?? '') ||
        due !== toDateTimeLocalValue(task.dueAt)),
  );

  /** Сохранение: те же проверки, что при создании задачи. */
  const handleSave = async () => {
    if (!task) return;
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
      const updated = await updateTask(task.id, {
        title: trimmedTitle,
        due_at: dueIso,
        description: trimmedDescription === '' ? null : trimmedDescription,
      });
      setTask(updated);
      setTitle(updated.title);
      setDue(toDateTimeLocalValue(updated.dueAt));
      setDescription(updated.description ?? '');
      onChanged();
    } catch (error) {
      if (error instanceof TaskApiError && error.fieldErrors) {
        setErrors({
          title: error.fieldErrors.title ?? '',
          due: error.fieldErrors.due_at ?? '',
          description: error.fieldErrors.description ?? '',
        });
      }
      setFormError(error instanceof Error ? error.message : 'Не удалось сохранить задачу');
    } finally {
      setSubmitting(false);
    }
  };

  /** Выполнение задачи: подтверждение не требуется, окно закрывается. */
  const handleComplete = async () => {
    if (!task) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await closeTask(task.id);
      onChanged();
      onClose();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Не удалось выполнить задачу');
    } finally {
      setSubmitting(false);
    }
  };

  /** Переход по ссылке: окно закрывается, открывается связанный объект. */
  const followLink = (href: string) => {
    onClose();
    navigate(href);
  };

  const counterparty = task ? counterpartyHref(task) : null;
  const linkedInteraction = task ? interactionHref(task) : null;

  return (
    <>
      <dialog
        ref={dialogRef}
        className="client-modal"
        aria-labelledby="task-card-title"
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

      <h2 className="client-modal__title" id="task-card-title">
        Карточка задачи
      </h2>

      {status === 'loading' ? <p className="client-modal__state">Загрузка…</p> : null}

      {status === 'error' ? (
        <div className="client-modal__state client-modal__state--error">
          <p className="client-modal__state-text">Не удалось загрузить задачу</p>
        </div>
      ) : null}

      {status === 'ready' && task ? (
        <>
          <div className="client-form__fields client-form__fields--main">
            <label className="client-field client-field--span-4" htmlFor="card-task-title">
              <span className="client-field__label">
                Название <span className="client-field__required">*</span>
              </span>
              <input
                id="card-task-title"
                className="client-field__input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={TASK_LIMITS.title}
                disabled={isDone || submitting}
                aria-invalid={Boolean(errors.title)}
              />
              {errors.title ? <span className="client-field__error">{errors.title}</span> : null}
            </label>

            <label className="client-field client-field--span-2" htmlFor="card-task-due">
              <span className="client-field__label">
                Срок выполнения <span className="client-field__required">*</span>
              </span>
              <input
                id="card-task-due"
                className="client-field__input"
                type="datetime-local"
                value={due}
                onChange={(event) => setDue(event.target.value)}
                disabled={isDone || submitting}
                aria-invalid={Boolean(errors.due)}
              />
              {errors.due ? <span className="client-field__error">{errors.due}</span> : null}
            </label>

            <div className="client-field client-field--span-6">
              <span className="client-field__label">Статус</span>
              <span
                className={`interaction-status interaction-status--${statusClass(task.statusView)}`}
              >
                {TASK_STATUS_LABELS[task.statusView]}
              </span>
            </div>

            <label className="client-field client-field--span-6" htmlFor="card-task-description">
              <span className="client-field__label">Описание</span>
              <textarea
                id="card-task-description"
                className="client-field__input client-field__textarea client-field__textarea--compact"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                maxLength={TASK_LIMITS.description}
                disabled={isDone || submitting}
              />
              {errors.description ? (
                <span className="client-field__error">{errors.description}</span>
              ) : null}
            </label>

            <div className="client-field client-field--span-3">
              <span className="client-field__label">Ответственный</span>
              <span className="task-card-value">{task.responsibleFullName}</span>
            </div>

            <div className="client-field client-field--span-3">
              <span className="client-field__label">Создана</span>
              <span className="task-card-value">{formatDateTime(task.createdAt)}</span>
            </div>

            <div className="client-field client-field--span-3">
              <span className="client-field__label">Контрагент</span>
              {counterparty ? (
                <button
                  type="button"
                  className="task-card-link"
                  onClick={() => followLink(counterparty)}
                >
                  {task.counterpartyName ?? 'Открыть карточку'}
                </button>
              ) : (
                <span className="task-card-value task-card-value--muted">—</span>
              )}
            </div>

            <div className="client-field client-field--span-3">
              <span className="client-field__label">Связанное взаимодействие</span>
              {linkedInteraction ? (
                <button
                  type="button"
                  className="task-card-link"
                  onClick={() => setLinkedOpen(true)}
                >
                  Открыть взаимодействие
                </button>
              ) : (
                <span className="task-card-value task-card-value--muted">—</span>
              )}
            </div>

            {task.completedAt ? (
              <div className="client-field client-field--span-6">
                <span className="client-field__label">Выполнена</span>
                <span className="task-card-value">{formatDateTime(task.completedAt)}</span>
              </div>
            ) : null}
          </div>

          {formError ? (
            <p className="client-form__error" role="alert">
              {formError}
            </p>
          ) : null}

          <div className="client-form__actions">
            {isDone ? null : (
              <>
                <button
                  type="button"
                  className="client-button client-button--primary"
                  onClick={handleSave}
                  disabled={submitting || !dirty}
                >
                  {submitting ? 'Сохранение…' : 'Сохранить'}
                </button>
                <button
                  type="button"
                  className="client-button client-button--secondary"
                  onClick={handleComplete}
                  disabled={submitting}
                >
                  Выполнить
                </button>
              </>
            )}
            <button
              type="button"
              className="client-button client-button--secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Закрыть
            </button>
          </div>
        </>
      ) : null}
      </dialog>

      {/* Взаимодействие открывается поверх карточки задачи: её закрытие вернёт задачу. */}
      <InteractionOverlay
        interactionId={linkedOpen && task ? task.interactionId : null}
        onClose={() => setLinkedOpen(false)}
      />
    </>
  );
}
