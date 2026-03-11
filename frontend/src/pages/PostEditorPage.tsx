import { useEffect, useRef, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";

import { apiFetch, buildApiUrl } from "../api/client";
import { formatBackendErrorMessage } from "../lib/errors";
import { formatScheduleValue } from "../lib/format";
import { formatValidationIssueMessage } from "../lib/validation";
import { PlatformBadge } from "../components/PlatformBadge";
import { PresenceBadge } from "../components/PresenceBadge";
import { PublishDialog } from "../components/PublishDialog";
import { PublicationStatusPanel } from "../components/PublicationStatusPanel";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/ToastProvider";
import type {
  Platform,
  MediaGenerateResponse,
  MediaModelInfo,
  MediaUploadResponse,
  PollData,
  PreviewResponse,
  PostDetail,
  PublishRecord,
  PublishStatus,
  ValidationIssue,
} from "../types";

const DEFAULT_USERNAMES: Record<Platform, string> = {
  telegram: "@biovoltru",
  vk: "@biovolt",
};
const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/webp";
const DEFAULT_IMAGE_SIZE = "1024x1024";
const PREVIEW_DEBOUNCE_MS = 400;

interface PostEditorFormValues {
  date: string;
  time: string;
  platform: Platform;
  post_type: string;
  rubric: string;
  hook_type: string;
  title: string;
  body: string;
  username: string;
  hashtags: string[];
  pollEnabled: boolean;
  pollQuestion: string;
  pollOptions: string[];
  imagePrompt: string;
  hasImage: boolean;
  status: PublishStatus;
  rawMarkdown: string;
}

interface PostSavePayload {
  date: string;
  time: string | null;
  platform: Platform;
  post_type: string | null;
  rubric: string | null;
  hook_type: string | null;
  title: string | null;
  body: string | null;
  username: string | null;
  hashtags: string[];
  poll: PollData | null;
  image_prompt: string | null;
}

function formatToday() {
  const today = new Date();
  const year = today.getFullYear();
  const month = `${today.getMonth() + 1}`.padStart(2, "0");
  const day = `${today.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildEmptyForm(): PostEditorFormValues {
  return {
    date: formatToday(),
    time: "",
    platform: "telegram",
    post_type: "",
    rubric: "",
    hook_type: "",
    title: "",
    body: "",
    username: DEFAULT_USERNAMES.telegram,
    hashtags: [],
    pollEnabled: false,
    pollQuestion: "",
    pollOptions: ["", ""],
    imagePrompt: "",
    hasImage: false,
    status: "draft",
    rawMarkdown: "",
  };
}

function toFormState(post: PostDetail): PostEditorFormValues {
  return {
    date: post.date ?? formatToday(),
    time: post.time ?? "",
    platform: post.platform ?? "telegram",
    post_type: post.post_type ?? "",
    rubric: post.rubric ?? "",
    hook_type: post.hook_type ?? "",
    title: post.title ?? "",
    body: post.body ?? "",
    username: post.username ?? DEFAULT_USERNAMES[post.platform ?? "telegram"],
    hashtags: post.hashtags,
    pollEnabled: Boolean(post.poll),
    pollQuestion: post.poll?.question ?? "",
    pollOptions: post.poll?.options.length ? post.poll.options : ["", ""],
    imagePrompt: post.image_prompt ?? "",
    hasImage: post.has_image,
    status: post.status,
    rawMarkdown: post.raw_markdown,
  };
}

function normalizeOptional(value: string) {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function toSavePayload(form: PostEditorFormValues): PostSavePayload {
  const pollOptions = form.pollOptions
    .map((option) => option.trim())
    .filter(Boolean);

  return {
    date: form.date,
    time: normalizeOptional(form.time),
    platform: form.platform,
    post_type: normalizeOptional(form.post_type),
    rubric: normalizeOptional(form.rubric),
    hook_type: normalizeOptional(form.hook_type),
    title: normalizeOptional(form.title),
    body: normalizeOptional(form.body),
    username: normalizeOptional(form.username),
    hashtags: form.hashtags,
    poll: form.pollEnabled
      ? {
          question: form.pollQuestion.trim(),
          options: pollOptions,
        }
      : null,
    image_prompt: normalizeOptional(form.imagePrompt),
  };
}

function buildComparableSnapshot(form: PostEditorFormValues) {
  return JSON.stringify(toSavePayload(form));
}

function buildPreviewPayload(
  form: PostEditorFormValues,
  platform: Platform,
  fileName: string | undefined,
) {
  const basePayload = toSavePayload(form);
  const previewPollOptions = form.pollOptions
    .map((option) => option.trim())
    .filter(Boolean);

  return {
    ...basePayload,
    file_name: fileName ?? "draft.md",
    platform,
    poll:
      form.pollEnabled &&
      form.pollQuestion.trim() &&
      previewPollOptions.length >= 2
        ? {
            question: form.pollQuestion.trim(),
            options: previewPollOptions,
          }
        : null,
    has_image: form.hasImage,
  };
}

function formatEditorTitle(filename: string | undefined) {
  return filename ? `Редактирование: ${filename}` : "Новый пост";
}

function formatAsyncError(error: unknown, fallback: string) {
  return error instanceof Error
    ? formatBackendErrorMessage(error.message)
    : fallback;
}

function buildMediaImageUrl(fileName: string, revision: number) {
  return buildApiUrl(`/media/${encodeURIComponent(fileName)}?v=${revision}`);
}

function validationClasses(level: ValidationIssue["level"]) {
  if (level === "error") {
    return "border-rose-200 bg-rose-50 text-rose-900";
  }
  if (level === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  return "border-sky-200 bg-sky-50 text-sky-900";
}

function charCountClasses(
  preview: PreviewResponse | undefined,
) {
  const issues = preview?.validation ?? [];
  if (issues.some((issue) => issue.level === "error")) {
    return "border-rose-200 bg-rose-50 text-rose-900";
  }
  if (issues.some((issue) => issue.code === "post_length")) {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  return "border-teal-200 bg-teal-50 text-teal-900";
}

function validationLevelLabel(level: ValidationIssue["level"]) {
  if (level === "error") {
    return "Ошибка";
  }
  if (level === "warning") {
    return "Предупреждение";
  }
  return "Инфо";
}

function FieldShell({
  label,
  children,
  hint,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-2 ${className}`.trim()}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function PostEditorPage() {
  const { filename } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [panel, setPanel] = useState<"editor" | "preview">("editor");
  const [formValues, setFormValues] = useState<PostEditorFormValues>(() =>
    buildEmptyForm(),
  );
  const [initialSnapshot, setInitialSnapshot] = useState(() =>
    buildComparableSnapshot(buildEmptyForm()),
  );
  const [hashtagInput, setHashtagInput] = useState("");
  const [imagePromptExpanded, setImagePromptExpanded] = useState(false);
  const [isImageDragActive, setIsImageDragActive] = useState(false);
  const [selectedImageModel, setSelectedImageModel] = useState("");
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaRevision, setMediaRevision] = useState(() => Date.now());
  const [previewPlatform, setPreviewPlatform] = useState<Platform>("telegram");
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishRecord | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [debouncedPreviewSignature, setDebouncedPreviewSignature] = useState(() =>
    JSON.stringify(buildPreviewPayload(buildEmptyForm(), "telegram", undefined)),
  );
  const [debouncedPublishValidationSignature, setDebouncedPublishValidationSignature] =
    useState(() =>
      JSON.stringify(buildPreviewPayload(buildEmptyForm(), "telegram", undefined)),
    );

  const postQuery = useQuery({
    queryKey: ["post", filename],
    queryFn: () => apiFetch<PostDetail>(`/posts/${filename}`),
    enabled: Boolean(filename),
    refetchOnWindowFocus: false,
  });

  const mediaModelsQuery = useQuery({
    queryKey: ["media", "models"],
    queryFn: () => apiFetch<MediaModelInfo[]>("/media/models"),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!filename) {
      const emptyForm = buildEmptyForm();
      setFormValues(emptyForm);
      setInitialSnapshot(buildComparableSnapshot(emptyForm));
      setImagePromptExpanded(false);
      setIsImageDragActive(false);
      setMediaError(null);
      setMediaRevision(Date.now());
      setPreviewPlatform(emptyForm.platform);
      return;
    }

    if (!postQuery.data) {
      return;
    }

    const nextForm = toFormState(postQuery.data);
    setFormValues(nextForm);
    setInitialSnapshot(buildComparableSnapshot(nextForm));
    setImagePromptExpanded(Boolean(nextForm.imagePrompt));
    setIsImageDragActive(false);
    setMediaError(null);
    setMediaRevision(Date.now());
    setPreviewPlatform(nextForm.platform);
  }, [filename, postQuery.data]);

  useEffect(() => {
    setIsPublishDialogOpen(false);
    setPublishResult(null);
    setPublishError(null);
  }, [filename]);

  const isDirty = buildComparableSnapshot(formValues) !== initialSnapshot;

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const previewSignature = JSON.stringify(
    buildPreviewPayload(formValues, previewPlatform, filename),
  );
  const publishValidationSignature = JSON.stringify(
    buildPreviewPayload(formValues, formValues.platform, filename),
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedPreviewSignature(previewSignature);
    }, PREVIEW_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [previewSignature]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedPublishValidationSignature(publishValidationSignature);
    }, PREVIEW_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [publishValidationSignature]);

  const previewQuery = useQuery({
    queryKey: ["preview", debouncedPreviewSignature],
    queryFn: () =>
      apiFetch<PreviewResponse>("/preview", {
        method: "POST",
        body: debouncedPreviewSignature,
      }),
    refetchOnWindowFocus: false,
  });

  const publishValidationQuery = useQuery({
    queryKey: ["preview", "publish-validation", debouncedPublishValidationSignature],
    queryFn: () =>
      apiFetch<PreviewResponse>("/preview", {
        method: "POST",
        body: debouncedPublishValidationSignature,
      }),
    enabled: Boolean(filename) && previewPlatform !== formValues.platform,
    refetchOnWindowFocus: false,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = toSavePayload(formValues);

      if (!payload.date) {
        throw new Error("Нужно указать дату.");
      }
      if (!payload.platform) {
        throw new Error("Нужно выбрать платформу.");
      }
      if (formValues.pollEnabled) {
        if (!payload.poll?.question) {
          throw new Error("Нужно заполнить вопрос опроса.");
        }
        if ((payload.poll.options ?? []).length < 2) {
          throw new Error("В опросе должно быть минимум 2 варианта.");
        }
      }

      if (filename) {
        return apiFetch<PostDetail>(`/posts/${filename}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      }

      return apiFetch<PostDetail>("/posts", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (savedPost) => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.setQueryData(["post", savedPost.file_name], savedPost);

      const nextForm = toFormState(savedPost);
      setFormValues(nextForm);
      setInitialSnapshot(buildComparableSnapshot(nextForm));

      if (!filename) {
        navigate(`/posts/${savedPost.file_name}`, { replace: true });
        pushToast({
          tone: "success",
          message: `Черновик создан: ${savedPost.file_name}`,
        });
        return;
      }

      pushToast({
        tone: "success",
        message: "Пост сохранен.",
      });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Не удалось сохранить пост.";
      pushToast({ tone: "error", message });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async ({ schedule }: { schedule: boolean }) => {
      if (!filename) {
        throw new Error("Сначала сохраните черновик.");
      }

      return apiFetch<PublishRecord>(`/publish/${encodeURIComponent(filename)}`, {
        method: "POST",
        body: JSON.stringify({ schedule }),
      });
    },
    onMutate: () => {
      setPublishResult(null);
      setPublishError(null);
    },
    onSuccess: async (record) => {
      setPublishResult(record);
      setPublishError(null);

      if (filename) {
        queryClient.setQueryData<PostDetail | undefined>(["post", filename], (current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            status: record.status,
            publish_records: [
              record,
              ...current.publish_records.filter((item) => item.id !== record.id),
            ],
          };
        });
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["posts"] }),
        queryClient.invalidateQueries({ queryKey: ["schedules"] }),
        ...(filename
          ? [queryClient.invalidateQueries({ queryKey: ["post", filename] })]
          : []),
      ]);

      pushToast({
        tone: "success",
        message:
          record.status === "scheduled"
            ? `Пост поставлен в очередь. ID сообщения: ${record.message_id ?? "ожидается"}.`
            : `Пост опубликован. ID сообщения: ${record.message_id ?? "ожидается"}.`,
      });
    },
    onError: (error) => {
      const message = formatAsyncError(error, "Запрос на публикацию завершился ошибкой.");
      setPublishError(message);
      setPublishResult(null);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["posts"] }),
        queryClient.invalidateQueries({ queryKey: ["schedules"] }),
        ...(filename
          ? [queryClient.invalidateQueries({ queryKey: ["post", filename] })]
          : []),
      ]);
      pushToast({ tone: "error", message });
    },
  });

  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!filename) {
        throw new Error("Сначала сохраните черновик, потом прикрепляйте изображение.");
      }

      const formData = new FormData();
      formData.append("file", file);

      return apiFetch<MediaUploadResponse>(
        `/media/upload/${encodeURIComponent(filename)}`,
        {
          method: "POST",
          body: formData,
        },
      );
    },
    onSuccess: () => {
      setMediaError(null);
      setMediaRevision(Date.now());
      setFormValues((current) => ({
        ...current,
        hasImage: true,
      }));
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      pushToast({
        tone: "success",
        message: "Изображение загружено и привязано к черновику.",
      });
    },
    onError: (error) => {
      const message = formatAsyncError(error, "Не удалось загрузить изображение.");
      setMediaError(message);
      pushToast({ tone: "error", message });
    },
  });

  const generateImageMutation = useMutation({
    mutationFn: async () => {
      if (!filename) {
        throw new Error("Сначала сохраните черновик, потом запускайте генерацию.");
      }

      const prompt = formValues.imagePrompt.trim();
      if (!prompt) {
        throw new Error("Перед генерацией нужно заполнить промпт.");
      }

      return apiFetch<MediaGenerateResponse>("/media/generate", {
        method: "POST",
        body: JSON.stringify({
          file_name: filename,
          prompt,
          model: selectedImageModel || undefined,
          size: DEFAULT_IMAGE_SIZE,
        }),
      });
    },
    onSuccess: (result) => {
      setMediaError(null);
      setMediaRevision(Date.now());
      setFormValues((current) => ({
        ...current,
        hasImage: true,
      }));
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      pushToast({
        tone: "success",
        message: result.model
          ? `Изображение сгенерировано моделью ${result.model}.`
          : "Изображение сгенерировано моделью бэкенда по умолчанию.",
      });
    },
    onError: (error) => {
      const message = formatAsyncError(error, "Не удалось сгенерировать изображение.");
      setMediaError(message);
      pushToast({ tone: "error", message });
    },
  });

  const deleteImageMutation = useMutation({
    mutationFn: async () => {
      if (!filename) {
        throw new Error("Сначала сохраните черновик.");
      }

      await apiFetch<void>(`/media/${encodeURIComponent(filename)}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      setMediaError(null);
      setMediaRevision(Date.now());
      setFormValues((current) => ({
        ...current,
        hasImage: false,
      }));
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      pushToast({
        tone: "success",
        message: "Изображение удалено.",
      });
    },
    onError: (error) => {
      const message = formatAsyncError(error, "Не удалось удалить изображение.");
      setMediaError(message);
      pushToast({ tone: "error", message });
    },
  });

  function setFieldValue<Key extends keyof PostEditorFormValues>(
    key: Key,
    value: PostEditorFormValues[Key],
  ) {
    setFormValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handlePlatformChange(nextPlatform: Platform) {
    setFormValues((current) => {
      const previousDefault = DEFAULT_USERNAMES[current.platform];
      const shouldAutofill =
        current.username.trim() === "" || current.username === previousDefault;

      return {
        ...current,
        platform: nextPlatform,
        username: shouldAutofill
          ? DEFAULT_USERNAMES[nextPlatform]
          : current.username,
      };
    });
  }

  function addHashtag() {
    const normalized = hashtagInput.trim().replace(/^#+/, "");
    if (!normalized) {
      return;
    }

    setFormValues((current) => {
      if (current.hashtags.includes(normalized)) {
        return current;
      }

      return {
        ...current,
        hashtags: [...current.hashtags, normalized],
      };
    });
    setHashtagInput("");
  }

  function removeHashtag(tag: string) {
    setFormValues((current) => ({
      ...current,
      hashtags: current.hashtags.filter((value) => value !== tag),
    }));
  }

  function togglePoll() {
    setFormValues((current) => ({
      ...current,
      pollEnabled: !current.pollEnabled,
      pollOptions:
        current.pollOptions.length >= 2 ? current.pollOptions : ["", ""],
    }));
  }

  function addPollOption() {
    setFormValues((current) => {
      if (current.pollOptions.length >= 10) {
        return current;
      }

      return {
        ...current,
        pollOptions: [...current.pollOptions, ""],
      };
    });
  }

  function removePollOption(index: number) {
    setFormValues((current) => {
      if (current.pollOptions.length <= 2) {
        return current;
      }

      return {
        ...current,
        pollOptions: current.pollOptions.filter((_, optionIndex) => optionIndex !== index),
      };
    });
  }

  function updatePollOption(index: number, value: string) {
    setFormValues((current) => ({
      ...current,
      pollOptions: current.pollOptions.map((option, optionIndex) =>
        optionIndex === index ? value : option,
      ),
    }));
  }

  async function uploadSelectedFile(file: File) {
    setMediaError(null);
    await uploadImageMutation.mutateAsync(file);
  }

  async function handleImageInputChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const nextFile = event.target.files?.[0];
    event.target.value = "";

    if (!nextFile) {
      return;
    }

    await uploadSelectedFile(nextFile);
  }

  function handleImagePickerOpen() {
    if (!filename) {
      const message = "Сначала сохраните черновик, потом прикрепляйте изображение.";
      setMediaError(message);
      pushToast({ tone: "warning", message });
      return;
    }

    fileInputRef.current?.click();
  }

  function handleImageDragEnter(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();

    if (!filename) {
      return;
    }

    setIsImageDragActive(true);
  }

  function handleImageDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();

    if (!filename) {
      return;
    }

    event.dataTransfer.dropEffect = "copy";
    setIsImageDragActive(true);
  }

  function handleImageDragLeave(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsImageDragActive(false);
  }

  async function handleImageDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsImageDragActive(false);

    if (!filename) {
      const message = "Сначала сохраните черновик, потом прикрепляйте изображение.";
      setMediaError(message);
      pushToast({ tone: "warning", message });
      return;
    }

    const nextFile = event.dataTransfer.files?.[0];
    if (!nextFile) {
      return;
    }

    await uploadSelectedFile(nextFile);
  }

  async function handleDeleteImage() {
    if (!filename) {
      return;
    }

    const shouldDelete = window.confirm(
      "Удалить прикрепленное изображение для этого черновика?",
    );
    if (!shouldDelete) {
      return;
    }

    setMediaError(null);
    await deleteImageMutation.mutateAsync();
  }

  function resetPublishFeedback() {
    setPublishResult(null);
    setPublishError(null);
  }

  function openPublishDialog() {
    resetPublishFeedback();
    setIsPublishDialogOpen(true);
  }

  function closePublishDialog() {
    if (publishMutation.isPending) {
      return;
    }

    setIsPublishDialogOpen(false);
    resetPublishFeedback();
  }

  async function handlePublishSubmit(mode: "now" | "schedule") {
    await publishMutation.mutateAsync({
      schedule: mode === "schedule",
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveMutation.mutateAsync();
  }

  const editorTitle = formatEditorTitle(filename);
  const pollOptionCount = formValues.pollOptions.filter((option) => option.trim()).length;
  const previewIssues = previewQuery.data?.validation ?? [];
  const publishValidationData =
    previewPlatform === formValues.platform
      ? previewQuery.data
      : publishValidationQuery.data;
  const publishValidationIssues = publishValidationData?.validation ?? [];
  const isPublishValidationDebouncing =
    publishValidationSignature !== debouncedPublishValidationSignature;
  const publishValidationPending =
    Boolean(filename) &&
    (isPublishValidationDebouncing ||
      (previewPlatform === formValues.platform
        ? previewQuery.isLoading || previewQuery.isFetching
        : publishValidationQuery.isLoading || publishValidationQuery.isFetching));
  const publishValidationError =
    previewPlatform === formValues.platform
      ? previewQuery.isError
        ? formatAsyncError(
            previewQuery.error,
            "Не удалось обновить валидацию публикации.",
          )
        : null
      : publishValidationQuery.isError
        ? formatAsyncError(
            publishValidationQuery.error,
            "Не удалось обновить валидацию публикации.",
          )
        : null;
  const previewCharCount = previewQuery.data?.char_count ?? 0;
  const canManageImage = Boolean(filename);
  const isImageMutationPending =
    uploadImageMutation.isPending ||
    generateImageMutation.isPending ||
    deleteImageMutation.isPending;
  const canOpenPublishDialog =
    Boolean(filename) &&
    !postQuery.isLoading &&
    !postQuery.isError &&
    !saveMutation.isPending &&
    !publishMutation.isPending;
  const mediaModels = [...(mediaModelsQuery.data ?? [])].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const mediaModelsError = mediaModelsQuery.isError
    ? formatAsyncError(
        mediaModelsQuery.error,
        "Не удалось загрузить список моделей для изображений.",
      )
    : null;
  const imagePreviewUrl =
    filename && formValues.hasImage
      ? buildMediaImageUrl(filename, mediaRevision)
      : null;
  const generatedImageName = filename
    ? `${filename.replace(/\.md$/, "")}.png`
    : "Изображение черновика";
  const publicationStatus = postQuery.data?.status ?? formValues.status;
  const publishRecords = postQuery.data?.publish_records ?? [];
  const publishAttempts = postQuery.data?.publish_attempts ?? [];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-orange-700/70">
              Редактор поста
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">
              {editorTitle}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Слева вы редактируете черновик через posts API, а справа сразу
              видите превью из `POST /api/preview`.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {filename ?? "Черновик еще не сохранен"}
            </p>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={publicationStatus} />
              <PlatformBadge platform={formValues.platform} />
              <PresenceBadge label="Изменения" active={isDirty} />
              <PresenceBadge label="Изображение" active={formValues.hasImage} />
              <PresenceBadge label="Опрос" active={formValues.pollEnabled} />
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                data-open-publish-dialog="true"
                className="inline-flex items-center justify-center rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                disabled={!canOpenPublishDialog}
                onClick={openPublishDialog}
              >
                Публикация
              </button>

              <button
                type="submit"
                form="post-editor-form"
                className="inline-flex items-center justify-center rounded-full bg-teal-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                disabled={saveMutation.isPending || postQuery.isLoading}
              >
                {saveMutation.isPending ? "Сохраняем…" : "Сохранить пост"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {postQuery.isLoading ? (
        <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 text-slate-600 shadow-sm">
          Загружаем пост из бэкенда…
        </section>
      ) : null}

      {postQuery.isError ? (
        <section className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-900 shadow-sm">
          Не удалось загрузить пост. Проверьте имя файла и состояние бэкенда.
        </section>
      ) : null}

      <div className="flex gap-2 xl:hidden">
        <button
          type="button"
          className={[
            "rounded-full border px-4 py-2 text-sm font-medium transition",
            panel === "editor"
              ? "border-teal-300 bg-teal-50 text-teal-900"
              : "border-slate-200 bg-white text-slate-600",
          ].join(" ")}
          onClick={() => setPanel("editor")}
        >
          Редактор
        </button>
        <button
          type="button"
          className={[
            "rounded-full border px-4 py-2 text-sm font-medium transition",
            panel === "preview"
              ? "border-teal-300 bg-teal-50 text-teal-900"
              : "border-slate-200 bg-white text-slate-600",
          ].join(" ")}
          onClick={() => setPanel("preview")}
        >
          Превью
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <div className={panel === "preview" ? "hidden xl:block" : ""}>
          <form
            id="post-editor-form"
            className="space-y-6"
            onSubmit={handleSubmit}
            data-editor-dirty={isDirty ? "true" : "false"}
            data-beforeunload-armed={isDirty ? "true" : "false"}
          >
            <PublicationStatusPanel
              fileName={filename}
              status={publicationStatus}
              publishRecords={publishRecords}
              publishAttempts={publishAttempts}
            />

            <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
              <div className="border-b border-slate-200 pb-4">
                <h3 className="text-xl font-semibold text-slate-950">Метаданные</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Дата, платформа, тип материала и канал публикации.
                </p>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <FieldShell label="Дата">
                  <input
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500"
                    type="date"
                    value={formValues.date}
                    onChange={(event) => setFieldValue("date", event.target.value)}
                  />
                </FieldShell>

                <FieldShell label="Время">
                  <input
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500"
                    type="time"
                    value={formValues.time}
                    onChange={(event) => setFieldValue("time", event.target.value)}
                  />
                </FieldShell>

                <FieldShell label="Платформа">
                  <select
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500"
                    value={formValues.platform}
                    onChange={(event) =>
                      handlePlatformChange(event.target.value as Platform)
                    }
                  >
                    <option value="telegram">Telegram</option>
                    <option value="vk">VK</option>
                  </select>
                </FieldShell>

                <FieldShell
                  label="Юзернейм"
                  hint="Подставляется из платформы, пока вы не зададите свое значение."
                >
                  <input
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500"
                    type="text"
                    value={formValues.username}
                    placeholder="@biovoltru"
                    onChange={(event) =>
                      setFieldValue("username", event.target.value)
                    }
                  />
                </FieldShell>

                <FieldShell label="Тип поста">
                  <input
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500"
                    type="text"
                    value={formValues.post_type}
                    placeholder="образовательный"
                    onChange={(event) =>
                      setFieldValue("post_type", event.target.value)
                    }
                  />
                </FieldShell>

                <FieldShell label="Рубрика">
                  <input
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500"
                    type="text"
                    value={formValues.rubric}
                    placeholder="Разряд знаний"
                    onChange={(event) =>
                      setFieldValue("rubric", event.target.value)
                    }
                  />
                </FieldShell>

                <FieldShell label="Тип хука" className="md:col-span-2">
                  <input
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500"
                    type="text"
                    value={formValues.hook_type}
                    placeholder="провокация"
                    onChange={(event) =>
                      setFieldValue("hook_type", event.target.value)
                    }
                  />
                </FieldShell>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
              <div className="border-b border-slate-200 pb-4">
                <h3 className="text-xl font-semibold text-slate-950">Контент</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Заголовок, markdown-текст и набор хэштегов для поста.
                </p>
              </div>

              <div className="mt-5 space-y-4">
                <FieldShell label="Заголовок">
                  <input
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500"
                    type="text"
                    value={formValues.title}
                    placeholder="Заголовок поста"
                    onChange={(event) =>
                      setFieldValue("title", event.target.value)
                    }
                  />
                </FieldShell>

                <FieldShell label="Текст">
                  <textarea
                    className="min-h-[280px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500"
                    value={formValues.body}
                    placeholder="Markdown-текст"
                    onChange={(event) => setFieldValue("body", event.target.value)}
                  />
                </FieldShell>

                <FieldShell label="Хэштеги" hint="Нажмите Enter или запятую, чтобы добавить тег.">
                  <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex flex-wrap gap-2">
                      {formValues.hashtags.length > 0 ? (
                        formValues.hashtags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-900 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-900"
                            onClick={() => removeHashtag(tag)}
                          >
                            #{tag} ×
                          </button>
                        ))
                      ) : (
                        <span className="text-sm text-slate-500">
                          Хэштегов пока нет.
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <input
                        className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500"
                        type="text"
                        value={hashtagInput}
                        placeholder="BioVolt"
                        onChange={(event) => setHashtagInput(event.target.value)}
                        onBlur={addHashtag}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === ",") {
                            event.preventDefault();
                            addHashtag();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="rounded-full border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white"
                        onClick={addHashtag}
                      >
                        Добавить хэштег
                      </button>
                    </div>
                  </div>
                </FieldShell>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
              <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-slate-950">Опрос</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Необязательный вопрос с 2-10 вариантами ответа.
                  </p>
                </div>

                <button
                  type="button"
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white"
                  onClick={togglePoll}
                >
                  {formValues.pollEnabled ? "Убрать опрос" : "Добавить опрос"}
                </button>
              </div>

              {formValues.pollEnabled ? (
                <div className="mt-5 space-y-4">
                  <FieldShell label="Вопрос опроса">
                    <input
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500"
                      type="text"
                      value={formValues.pollQuestion}
                      placeholder="Ваш вопрос"
                      onChange={(event) =>
                        setFieldValue("pollQuestion", event.target.value)
                      }
                    />
                  </FieldShell>

                  <div className="space-y-3">
                    {formValues.pollOptions.map((option, index) => (
                      <div
                        key={`poll-option-${index}`}
                        className="flex flex-col gap-3 sm:flex-row"
                      >
                        <input
                          className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500"
                          type="text"
                          value={option}
                          placeholder={`Вариант ${index + 1}`}
                          onChange={(event) =>
                            updatePollOption(index, event.target.value)
                          }
                        />
                        <button
                          type="button"
                          className="rounded-full border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:text-slate-400"
                          disabled={formValues.pollOptions.length <= 2}
                          onClick={() => removePollOption(index)}
                        >
                          Удалить
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-400">
                      {pollOptionCount} заполненных вариантов
                    </p>
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:text-slate-400"
                      disabled={formValues.pollOptions.length >= 10}
                      onClick={addPollOption}
                    >
                      Добавить вариант
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-5 text-sm text-slate-500">
                  Для этого черновика опрос отключен.
                </p>
              )}
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
              <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-slate-950">
                    Промпт изображения
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Промпт, загрузка, генерация и удаление связаны с media API
                    бэкенда для этого черновика.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <PresenceBadge
                    label={formValues.hasImage ? "Прикреплено" : "Без изображения"}
                    active={formValues.hasImage}
                  />
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white"
                    onClick={() =>
                      setImagePromptExpanded((current) => !current)
                    }
                  >
                    {imagePromptExpanded ? "Свернуть блок" : "Развернуть блок"}
                  </button>
                </div>
              </div>

              {imagePromptExpanded ? (
                <div className="mt-5 space-y-5">
                  <FieldShell label="Промпт">
                    <textarea
                      data-image-prompt-input="true"
                      className="min-h-[180px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500"
                      value={formValues.imagePrompt}
                      placeholder="Опишите желаемое изображение"
                      onChange={(event) =>
                        setFieldValue("imagePrompt", event.target.value)
                      }
                    />
                  </FieldShell>

                  <input
                    ref={fileInputRef}
                    data-media-input="true"
                    className="hidden"
                    type="file"
                    accept={ACCEPTED_IMAGE_TYPES}
                    onChange={handleImageInputChange}
                  />

                  <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          data-media-upload-button="true"
                          className="rounded-full border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:text-slate-400"
                          disabled={!canManageImage || isImageMutationPending}
                          onClick={handleImagePickerOpen}
                        >
                          {uploadImageMutation.isPending
                            ? "Загружаем…"
                            : "Загрузить файл"}
                        </button>

                        <button
                          type="button"
                          data-media-generate-button="true"
                          className="rounded-full bg-teal-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                          disabled={
                            !canManageImage ||
                            isImageMutationPending ||
                            !formValues.imagePrompt.trim()
                          }
                          onClick={() => {
                            setMediaError(null);
                            void generateImageMutation.mutateAsync();
                          }}
                        >
                          {generateImageMutation.isPending
                            ? "Генерируем…"
                            : formValues.hasImage
                              ? "Перегенерировать изображение"
                              : "Сгенерировать изображение"}
                        </button>

                        <button
                          type="button"
                          data-media-delete-button="true"
                          className="rounded-full border border-rose-200 px-4 py-3 text-sm font-medium text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                          disabled={
                            !canManageImage ||
                            isImageMutationPending ||
                            !formValues.hasImage
                          }
                          onClick={() => {
                            void handleDeleteImage();
                          }}
                        >
                          {deleteImageMutation.isPending
                            ? "Удаляем…"
                            : "Удалить изображение"}
                        </button>

                        {formValues.imagePrompt ? (
                          <button
                            type="button"
                            className="rounded-full border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white"
                            onClick={() => setFieldValue("imagePrompt", "")}
                          >
                            Очистить промпт
                          </button>
                        ) : null}
                      </div>

                      <div
                        data-media-dropzone="true"
                        data-drag-active={isImageDragActive ? "true" : "false"}
                        className={[
                          "rounded-[28px] border border-dashed p-5 transition",
                          isImageDragActive
                            ? "border-teal-300 bg-teal-50"
                            : "border-slate-200 bg-slate-50/80",
                        ].join(" ")}
                        onDragEnter={handleImageDragEnter}
                        onDragOver={handleImageDragOver}
                        onDragLeave={handleImageDragLeave}
                        onDrop={(event) => {
                          void handleImageDrop(event);
                        }}
                      >
                        <p className="text-sm font-medium text-slate-900">
                          Перетащите сюда PNG, JPG или WEBP
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          {canManageImage
                            ? "Файл будет конвертирован в PNG и сохранен под именем черновика."
                            : "Сначала сохраните черновик, чтобы бэкенд получил стабильное имя файла."}
                        </p>
                      </div>

                      <div className="grid gap-4 md:grid-cols-[1fr_0.9fr]">
                        <FieldShell
                          label="Модель"
                          hint={
                            mediaModels.length > 0
                              ? `${mediaModels.length} моделей доступно из внешнего API.`
                              : "Автовыбор использует модель бэкенда по умолчанию."
                          }
                        >
                          <select
                            data-media-model="true"
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500 disabled:cursor-not-allowed disabled:text-slate-400"
                            value={selectedImageModel}
                            disabled={isImageMutationPending}
                            onChange={(event) =>
                              setSelectedImageModel(event.target.value)
                            }
                          >
                            <option value="">Авто (модель бэкенда)</option>
                            {mediaModels.map((model) => (
                              <option key={model.id} value={model.id}>
                                {model.id}
                                {model.owned_by ? ` • ${model.owned_by}` : ""}
                              </option>
                            ))}
                          </select>
                        </FieldShell>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                          <p className="text-sm font-medium text-slate-700">
                            Статус медиа
                          </p>
                          <p className="mt-2 text-sm leading-6 text-slate-500">
                            {formValues.hasImage
                              ? `Прикрепленный файл: ${generatedImageName}`
                              : "Изображение пока не прикреплено."}
                          </p>
                          <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                            {mediaModelsQuery.isLoading
                              ? "Загружаем модели"
                              : selectedImageModel
                                ? `Выбрана модель: ${selectedImageModel}`
                                : "Выбрана модель бэкенда по умолчанию"}
                          </p>
                        </div>
                      </div>

                      {mediaError ? (
                        <div
                          data-media-error="true"
                          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
                        >
                          {mediaError}
                        </div>
                      ) : null}

                      {mediaModelsError ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                          {mediaModelsError} Проверьте настройки Image API, если
                          генерация недоступна.
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">
                            Миниатюра
                          </p>
                          <p className="mt-2 text-sm text-slate-500">
                            {generatedImageName}
                          </p>
                        </div>
                        <PresenceBadge
                          label={formValues.hasImage ? "Готово" : "Пусто"}
                          active={formValues.hasImage}
                        />
                      </div>

                      <div className="mt-4 overflow-hidden rounded-[24px] border border-slate-200 bg-white">
                        {imagePreviewUrl ? (
                          <img
                            data-media-image-preview="true"
                            className="h-[320px] w-full object-cover"
                            src={imagePreviewUrl}
                            alt={`Предпросмотр изображения ${generatedImageName}`}
                          />
                        ) : (
                          <div className="flex h-[320px] items-center justify-center px-6 text-center text-sm leading-6 text-slate-500">
                            {formValues.imagePrompt.trim()
                              ? "Промпт готов. Сгенерируйте или загрузите изображение, чтобы увидеть миниатюру."
                              : "Изображения пока нет. Добавьте промпт или перетащите файл сюда."}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-5 text-sm text-slate-500">
                  {formValues.hasImage
                    ? "Изображение прикреплено, но панель управления свернута."
                    : formValues.imagePrompt
                      ? "Промпт сохранен, но панель управления свернута."
                      : "Раздел с промптом свернут, пока вы его не раскроете."}
                </p>
              )}
            </section>

            <section className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50/90 p-5 shadow-sm md:flex-row md:items-center md:justify-between">
              <div className="space-y-1 text-sm">
                <p className="text-slate-700">
                  {isDirty
                    ? "Есть несохраненные изменения."
                    : "Все изменения сохранены."}
                </p>
                <p className="text-slate-500">
                  {formValues.rawMarkdown
                    ? "Исходный markdown загружен из бэкенда."
                    : "Markdown-файл будет создан после первого сохранения."}
                </p>
              </div>

              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-full bg-teal-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                disabled={saveMutation.isPending || postQuery.isLoading}
              >
                {saveMutation.isPending ? "Сохраняем…" : "Сохранить пост"}
              </button>
            </section>
          </form>
        </div>

        <div className={panel === "editor" ? "hidden xl:block" : ""}>
          <section
            className="space-y-5 rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm"
            data-preview-platform={previewPlatform}
          >
            <div className="flex flex-col gap-4 border-b border-slate-200 pb-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-slate-950">Превью</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Превью обновляется после debounce {PREVIEW_DEBOUNCE_MS} мс и
                    показывает рендер для выбранной платформы.
                  </p>
                </div>

                <div className="flex gap-2">
                  {(["telegram", "vk"] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={[
                        "rounded-full border px-4 py-2 text-sm font-medium transition",
                        previewPlatform === item
                          ? "border-teal-300 bg-teal-50 text-teal-900"
                          : "border-slate-200 bg-white text-slate-600",
                      ].join(" ")}
                      onClick={() => setPreviewPlatform(item)}
                    >
                      {item === "telegram" ? "Telegram" : "VK"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={[
                    "rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
                    charCountClasses(previewQuery.data),
                  ].join(" ")}
                  data-char-count={previewCharCount}
                >
                  {previewCharCount} символов
                </span>
                <PresenceBadge
                  label={previewQuery.isFetching ? "Обновляем" : "Актуально"}
                  active={!previewQuery.isFetching}
                />
                <PresenceBadge
                  label={`Замечаний: ${previewIssues.length}`}
                  active={previewIssues.length > 0}
                />
              </div>
            </div>

            {previewQuery.isLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5 text-sm text-slate-600">
                Собираем превью из текущего черновика…
              </div>
            ) : null}

            {previewQuery.isError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900">
                Запрос на превью завершился ошибкой. Продолжайте редактирование и
                повторите после следующего валидного запроса.
              </div>
            ) : null}

            {previewQuery.data ? (
              <div className="space-y-5">
                <div
                  className={[
                    "rounded-[28px] border p-5 shadow-sm",
                    previewPlatform === "telegram"
                      ? "border-cyan-200 bg-gradient-to-br from-cyan-50 to-white"
                      : "border-indigo-200 bg-gradient-to-br from-indigo-50 to-white",
                  ].join(" ")}
                >
                  <div className="mb-4 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-slate-500">
                    <span>
                      {previewPlatform === "telegram"
                        ? "Рендер Telegram"
                        : "Рендер VK"}
                    </span>
                    <span>{previewQuery.data.platform ?? previewPlatform}</span>
                  </div>

                  {previewPlatform === "telegram" ? (
                    <div
                      data-preview-body="telegram"
                      className="space-y-3 rounded-[24px] bg-white p-5 text-sm leading-7 text-slate-900 shadow-inner"
                      dangerouslySetInnerHTML={{
                        __html: previewQuery.data.rendered_text.replace(
                          /\n/g,
                          "<br />",
                        ),
                      }}
                    />
                  ) : (
                    <pre
                      data-preview-body="vk"
                      className="whitespace-pre-wrap rounded-[24px] bg-white p-5 text-sm leading-7 text-slate-900 shadow-inner"
                    >
                      {previewQuery.data.rendered_text}
                    </pre>
                  )}
                </div>

                {previewQuery.data.poll ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">
                        Превью опроса
                      </h4>
                      <PresenceBadge label="Опрос" />
                    </div>
                    <p className="mt-4 text-base font-semibold text-slate-950">
                      {previewQuery.data.poll.question}
                    </p>
                    <div className="mt-4 grid gap-2">
                      {previewQuery.data.poll.options.map((option) => (
                        <div
                          key={option}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
                        >
                          {option}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {formValues.hasImage || formValues.imagePrompt.trim() ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">
                        Превью изображения
                      </h4>
                      <PresenceBadge
                        label={formValues.hasImage ? "Прикреплено" : "Промпт готов"}
                      />
                    </div>
                    <div className="mt-4 overflow-hidden rounded-[24px] border border-dashed border-slate-200 bg-white">
                      {imagePreviewUrl ? (
                        <img
                          className="h-[260px] w-full object-cover"
                          src={imagePreviewUrl}
                          alt={`Предпросмотр изображения ${generatedImageName}`}
                        />
                      ) : (
                        <div className="p-8 text-center text-sm text-slate-400">
                          Промпт готов. Загрузите или сгенерируйте изображение,
                          чтобы прикрепить финальный файл.
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}

                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">
                      Валидация
                    </h4>
                    <span
                      className="text-sm text-slate-500"
                      data-validation-count={previewIssues.length}
                    >
                      {previewIssues.length} замечаний
                    </span>
                  </div>

                  {previewIssues.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      {previewIssues.map((issue) => (
                        <div
                          key={`${issue.level}-${issue.code}`}
                          className={[
                            "rounded-2xl border px-4 py-3 text-sm",
                            validationClasses(issue.level),
                          ].join(" ")}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-semibold uppercase tracking-[0.14em]">
                              {validationLevelLabel(issue.level)}
                            </span>
                            <span className="text-xs uppercase tracking-[0.14em] opacity-70">
                              {issue.code}
                            </span>
                          </div>
                          <p className="mt-2 leading-6">
                            {formatValidationIssueMessage(issue)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-slate-400">
                      Для текущего запроса превью замечаний нет.
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>

      {filename ? (
        <PublishDialog
          open={isPublishDialogOpen}
          fileName={filename}
          platform={formValues.platform}
          currentStatus={publicationStatus}
          scheduledDate={formValues.date}
          scheduledTime={formValues.time}
          hasUnsavedChanges={isDirty}
          validationIssues={publishValidationIssues}
          validationPending={publishValidationPending}
          validationErrorMessage={publishValidationError}
          submitPending={publishMutation.isPending}
          result={publishResult}
          errorMessage={publishError}
          onClose={closePublishDialog}
          onResetFeedback={resetPublishFeedback}
          onSubmit={(mode) => {
            void handlePublishSubmit(mode);
          }}
        />
      ) : null}
    </div>
  );
}
