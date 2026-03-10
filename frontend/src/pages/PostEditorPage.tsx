import { useEffect, useRef, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";

import { apiFetch, buildApiUrl } from "../api/client";
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
  return filename ? `Editing: ${filename}` : "New post";
}

function formatAsyncError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function buildMediaImageUrl(fileName: string, revision: number) {
  return buildApiUrl(`/media/${encodeURIComponent(fileName)}?v=${revision}`);
}

function validationClasses(level: ValidationIssue["level"]) {
  if (level === "error") {
    return "border-rose-400/30 bg-rose-400/10 text-rose-100";
  }
  if (level === "warning") {
    return "border-amber-400/30 bg-amber-400/10 text-amber-100";
  }
  return "border-sky-400/30 bg-sky-400/10 text-sky-100";
}

function charCountClasses(
  preview: PreviewResponse | undefined,
) {
  const issues = preview?.validation ?? [];
  if (issues.some((issue) => issue.level === "error")) {
    return "border-rose-400/30 bg-rose-400/10 text-rose-100";
  }
  if (issues.some((issue) => issue.code === "post_length")) {
    return "border-amber-400/30 bg-amber-400/10 text-amber-100";
  }
  return "border-teal-400/30 bg-teal-400/10 text-teal-100";
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
      <span className="text-sm font-medium text-slate-200">{label}</span>
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
        throw new Error("Date is required.");
      }
      if (!payload.platform) {
        throw new Error("Platform is required.");
      }
      if (formValues.pollEnabled) {
        if (!payload.poll?.question) {
          throw new Error("Poll question is required.");
        }
        if ((payload.poll.options ?? []).length < 2) {
          throw new Error("Poll must contain at least 2 options.");
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
          message: `Draft created: ${savedPost.file_name}`,
        });
        return;
      }

      pushToast({
        tone: "success",
        message: "Post saved.",
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to save post.";
      pushToast({ tone: "error", message });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async ({ schedule }: { schedule: boolean }) => {
      if (!filename) {
        throw new Error("Save the draft before publishing.");
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
            ? `Scheduled. Message ID: ${record.message_id ?? "pending"}.`
            : `Published. Message ID: ${record.message_id ?? "pending"}.`,
      });
    },
    onError: (error) => {
      const message = formatAsyncError(error, "Publish request failed.");
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
        throw new Error("Save the draft before attaching an image.");
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
        message: "Image uploaded and linked to the draft.",
      });
    },
    onError: (error) => {
      const message = formatAsyncError(error, "Failed to upload the image.");
      setMediaError(message);
      pushToast({ tone: "error", message });
    },
  });

  const generateImageMutation = useMutation({
    mutationFn: async () => {
      if (!filename) {
        throw new Error("Save the draft before generating an image.");
      }

      const prompt = formValues.imagePrompt.trim();
      if (!prompt) {
        throw new Error("Image prompt is required before generation.");
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
          ? `Image generated with ${result.model}.`
          : "Image generated with the backend default model.",
      });
    },
    onError: (error) => {
      const message = formatAsyncError(error, "Image generation failed.");
      setMediaError(message);
      pushToast({ tone: "error", message });
    },
  });

  const deleteImageMutation = useMutation({
    mutationFn: async () => {
      if (!filename) {
        throw new Error("Save the draft before deleting an image.");
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
        message: "Attached image deleted.",
      });
    },
    onError: (error) => {
      const message = formatAsyncError(error, "Failed to delete the image.");
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
      const message = "Save the draft before attaching an image.";
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
      const message = "Save the draft before attaching an image.";
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
      "Delete the attached image for this draft?",
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
            "Could not refresh publish validation.",
          )
        : null
      : publishValidationQuery.isError
        ? formatAsyncError(
            publishValidationQuery.error,
            "Could not refresh publish validation.",
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
        "Could not load image model options.",
      )
    : null;
  const imagePreviewUrl =
    filename && formValues.hasImage
      ? buildMediaImageUrl(filename, mediaRevision)
      : null;
  const generatedImageName = filename
    ? `${filename.replace(/\.md$/, "")}.png`
    : "Draft image";
  const publicationStatus = postQuery.data?.status ?? formValues.status;
  const publishRecords = postQuery.data?.publish_records ?? [];
  const publishAttempts = postQuery.data?.publish_attempts ?? [];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-orange-300/70">
              Post editor
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              {editorTitle}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              Левая колонка редактирует draft поверх posts API, а правая уже
              показывает live preview через `POST /api/preview`.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {filename ?? "Draft is not saved yet"}
            </p>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={publicationStatus} />
              <PlatformBadge platform={formValues.platform} />
              <PresenceBadge label="Unsaved" active={isDirty} />
              <PresenceBadge label="Image" active={formValues.hasImage} />
              <PresenceBadge label="Poll" active={formValues.pollEnabled} />
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                data-open-publish-dialog="true"
                className="inline-flex items-center justify-center rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-slate-900 disabled:text-slate-500"
                disabled={!canOpenPublishDialog}
                onClick={openPublishDialog}
              >
                Publish
              </button>

              <button
                type="submit"
                form="post-editor-form"
                className="inline-flex items-center justify-center rounded-full bg-teal-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                disabled={saveMutation.isPending || postQuery.isLoading}
              >
                {saveMutation.isPending ? "Saving..." : "Save post"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {postQuery.isLoading ? (
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 text-slate-300">
          Loading post from backend...
        </section>
      ) : null}

      {postQuery.isError ? (
        <section className="rounded-3xl border border-rose-400/30 bg-rose-400/10 p-6 text-rose-100">
          Failed to load the post. Check the filename or backend state.
        </section>
      ) : null}

      <div className="flex gap-2 xl:hidden">
        <button
          type="button"
          className={[
            "rounded-full border px-4 py-2 text-sm font-medium transition",
            panel === "editor"
              ? "border-teal-400/70 bg-teal-400/15 text-teal-100"
              : "border-white/10 bg-white/5 text-slate-300",
          ].join(" ")}
          onClick={() => setPanel("editor")}
        >
          Editor
        </button>
        <button
          type="button"
          className={[
            "rounded-full border px-4 py-2 text-sm font-medium transition",
            panel === "preview"
              ? "border-teal-400/70 bg-teal-400/15 text-teal-100"
              : "border-white/10 bg-white/5 text-slate-300",
          ].join(" ")}
          onClick={() => setPanel("preview")}
        >
          Preview
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

            <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="border-b border-white/10 pb-4">
                <h3 className="text-xl font-semibold text-white">Metadata</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Schedule, platform, content taxonomy and channel identity.
                </p>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <FieldShell label="Date">
                  <input
                    className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400/60"
                    type="date"
                    value={formValues.date}
                    onChange={(event) => setFieldValue("date", event.target.value)}
                  />
                </FieldShell>

                <FieldShell label="Time">
                  <input
                    className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400/60"
                    type="time"
                    value={formValues.time}
                    onChange={(event) => setFieldValue("time", event.target.value)}
                  />
                </FieldShell>

                <FieldShell label="Platform">
                  <select
                    className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400/60"
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
                  label="Username"
                  hint="Autofilled from platform unless you override it."
                >
                  <input
                    className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400/60"
                    type="text"
                    value={formValues.username}
                    placeholder="@biovoltru"
                    onChange={(event) =>
                      setFieldValue("username", event.target.value)
                    }
                  />
                </FieldShell>

                <FieldShell label="Post type">
                  <input
                    className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400/60"
                    type="text"
                    value={formValues.post_type}
                    placeholder="educational"
                    onChange={(event) =>
                      setFieldValue("post_type", event.target.value)
                    }
                  />
                </FieldShell>

                <FieldShell label="Rubric">
                  <input
                    className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400/60"
                    type="text"
                    value={formValues.rubric}
                    placeholder="Разряд знаний"
                    onChange={(event) =>
                      setFieldValue("rubric", event.target.value)
                    }
                  />
                </FieldShell>

                <FieldShell label="Hook type" className="md:col-span-2">
                  <input
                    className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400/60"
                    type="text"
                    value={formValues.hook_type}
                    placeholder="provocation"
                    onChange={(event) =>
                      setFieldValue("hook_type", event.target.value)
                    }
                  />
                </FieldShell>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="border-b border-white/10 pb-4">
                <h3 className="text-xl font-semibold text-white">Content</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Title, markdown body and hashtag composition for the post.
                </p>
              </div>

              <div className="mt-5 space-y-4">
                <FieldShell label="Title">
                  <input
                    className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400/60"
                    type="text"
                    value={formValues.title}
                    placeholder="Post title"
                    onChange={(event) =>
                      setFieldValue("title", event.target.value)
                    }
                  />
                </FieldShell>

                <FieldShell label="Body">
                  <textarea
                    className="min-h-[280px] rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-teal-400/60"
                    value={formValues.body}
                    placeholder="Markdown body"
                    onChange={(event) => setFieldValue("body", event.target.value)}
                  />
                </FieldShell>

                <FieldShell label="Hashtags" hint="Press Enter or comma to add.">
                  <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                    <div className="flex flex-wrap gap-2">
                      {formValues.hashtags.length > 0 ? (
                        formValues.hashtags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            className="rounded-full border border-teal-400/25 bg-teal-400/10 px-3 py-1 text-xs font-medium text-teal-100 transition hover:border-rose-300/40 hover:bg-rose-400/10 hover:text-rose-100"
                            onClick={() => removeHashtag(tag)}
                          >
                            #{tag} ×
                          </button>
                        ))
                      ) : (
                        <span className="text-sm text-slate-500">
                          No hashtags yet.
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <input
                        className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-teal-400/60"
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
                        className="rounded-full border border-white/10 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/10"
                        onClick={addHashtag}
                      >
                        Add hashtag
                      </button>
                    </div>
                  </div>
                </FieldShell>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex flex-col gap-4 border-b border-white/10 pb-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-white">Poll</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Optional question with 2-10 inline-editable options.
                  </p>
                </div>

                <button
                  type="button"
                  className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/10"
                  onClick={togglePoll}
                >
                  {formValues.pollEnabled ? "Remove poll" : "Add poll"}
                </button>
              </div>

              {formValues.pollEnabled ? (
                <div className="mt-5 space-y-4">
                  <FieldShell label="Poll question">
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400/60"
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
                          className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400/60"
                          type="text"
                          value={option}
                          placeholder={`Option ${index + 1}`}
                          onChange={(event) =>
                            updatePollOption(index, event.target.value)
                          }
                        />
                        <button
                          type="button"
                          className="rounded-full border border-white/10 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-slate-500"
                          disabled={formValues.pollOptions.length <= 2}
                          onClick={() => removePollOption(index)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-400">
                      {pollOptionCount} filled options
                    </p>
                    <button
                      type="button"
                      className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-slate-500"
                      disabled={formValues.pollOptions.length >= 10}
                      onClick={addPollOption}
                    >
                      Add option
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-5 text-sm text-slate-500">
                  Poll is disabled for this draft.
                </p>
              )}
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex flex-col gap-4 border-b border-white/10 pb-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-white">
                    Image prompt
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Prompt, upload, generation and delete are wired to the
                    backend media API for this draft.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <PresenceBadge
                    label={formValues.hasImage ? "Attached" : "No image"}
                    active={formValues.hasImage}
                  />
                  <button
                    type="button"
                    className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/10"
                    onClick={() =>
                      setImagePromptExpanded((current) => !current)
                    }
                  >
                    {imagePromptExpanded ? "Collapse prompt" : "Expand prompt"}
                  </button>
                </div>
              </div>

              {imagePromptExpanded ? (
                <div className="mt-5 space-y-5">
                  <FieldShell label="Prompt">
                    <textarea
                      data-image-prompt-input="true"
                      className="min-h-[180px] rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-teal-400/60"
                      value={formValues.imagePrompt}
                      placeholder="Describe the desired image"
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
                          className="rounded-full border border-white/10 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-slate-500"
                          disabled={!canManageImage || isImageMutationPending}
                          onClick={handleImagePickerOpen}
                        >
                          {uploadImageMutation.isPending
                            ? "Uploading..."
                            : "Upload file"}
                        </button>

                        <button
                          type="button"
                          data-media-generate-button="true"
                          className="rounded-full bg-teal-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
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
                            ? "Generating..."
                            : formValues.hasImage
                              ? "Regenerate image"
                              : "Generate image"}
                        </button>

                        <button
                          type="button"
                          data-media-delete-button="true"
                          className="rounded-full border border-rose-300/20 px-4 py-3 text-sm font-medium text-rose-100 transition hover:border-rose-300/40 hover:bg-rose-400/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
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
                            ? "Deleting..."
                            : "Delete image"}
                        </button>

                        {formValues.imagePrompt ? (
                          <button
                            type="button"
                            className="rounded-full border border-white/10 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/10"
                            onClick={() => setFieldValue("imagePrompt", "")}
                          >
                            Clear prompt
                          </button>
                        ) : null}
                      </div>

                      <div
                        data-media-dropzone="true"
                        data-drag-active={isImageDragActive ? "true" : "false"}
                        className={[
                          "rounded-[28px] border border-dashed p-5 transition",
                          isImageDragActive
                            ? "border-teal-300/70 bg-teal-400/10"
                            : "border-white/10 bg-slate-950/40",
                        ].join(" ")}
                        onDragEnter={handleImageDragEnter}
                        onDragOver={handleImageDragOver}
                        onDragLeave={handleImageDragLeave}
                        onDrop={(event) => {
                          void handleImageDrop(event);
                        }}
                      >
                        <p className="text-sm font-medium text-slate-100">
                          Drag PNG, JPG or WEBP here
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-400">
                          {canManageImage
                            ? "The upload is converted to PNG and saved under the draft filename."
                            : "Save the draft first so the backend has a stable filename for the image."}
                        </p>
                      </div>

                      <div className="grid gap-4 md:grid-cols-[1fr_0.9fr]">
                        <FieldShell
                          label="Model"
                          hint={
                            mediaModels.length > 0
                              ? `${mediaModels.length} models available from the upstream API.`
                              : "Auto uses the backend default model."
                          }
                        >
                          <select
                            data-media-model="true"
                            className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400/60 disabled:cursor-not-allowed disabled:text-slate-500"
                            value={selectedImageModel}
                            disabled={isImageMutationPending}
                            onChange={(event) =>
                              setSelectedImageModel(event.target.value)
                            }
                          >
                            <option value="">Auto (backend default)</option>
                            {mediaModels.map((model) => (
                              <option key={model.id} value={model.id}>
                                {model.id}
                                {model.owned_by ? ` • ${model.owned_by}` : ""}
                              </option>
                            ))}
                          </select>
                        </FieldShell>

                        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                          <p className="text-sm font-medium text-slate-200">
                            Media status
                          </p>
                          <p className="mt-2 text-sm leading-6 text-slate-400">
                            {formValues.hasImage
                              ? `Attached asset: ${generatedImageName}`
                              : "No image file attached yet."}
                          </p>
                          <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                            {mediaModelsQuery.isLoading
                              ? "Loading models"
                              : selectedImageModel
                                ? `Selected model: ${selectedImageModel}`
                                : "Selected model: backend default"}
                          </p>
                        </div>
                      </div>

                      {mediaError ? (
                        <div
                          data-media-error="true"
                          className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100"
                        >
                          {mediaError}
                        </div>
                      ) : null}

                      {mediaModelsError ? (
                        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                          {mediaModelsError} Configure Image API settings if
                          generation is unavailable.
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-[28px] border border-white/10 bg-slate-950/40 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                            Thumbnail
                          </p>
                          <p className="mt-2 text-sm text-slate-400">
                            {generatedImageName}
                          </p>
                        </div>
                        <PresenceBadge
                          label={formValues.hasImage ? "Ready" : "Empty"}
                          active={formValues.hasImage}
                        />
                      </div>

                      <div className="mt-4 overflow-hidden rounded-[24px] border border-white/10 bg-gradient-to-br from-white/5 to-transparent">
                        {imagePreviewUrl ? (
                          <img
                            data-media-image-preview="true"
                            className="h-[320px] w-full object-cover"
                            src={imagePreviewUrl}
                            alt={`Preview for ${generatedImageName}`}
                          />
                        ) : (
                          <div className="flex h-[320px] items-center justify-center px-6 text-center text-sm leading-6 text-slate-500">
                            {formValues.imagePrompt.trim()
                              ? "Prompt is ready. Generate or upload an image to see the thumbnail."
                              : "No image yet. Add a prompt or drop a file here."}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-5 text-sm text-slate-500">
                  {formValues.hasImage
                    ? "Image is attached, but the management panel is collapsed."
                    : formValues.imagePrompt
                      ? "Prompt is stored, but the management panel is collapsed."
                      : "Prompt section is collapsed until you expand it."}
                </p>
              )}
            </section>

            <section className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-slate-950/50 p-5 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1 text-sm">
                <p className="text-slate-200">
                  {isDirty
                    ? "Unsaved changes detected."
                    : "All changes are saved."}
                </p>
                <p className="text-slate-500">
                  {formValues.rawMarkdown
                    ? "Raw markdown is loaded from backend."
                    : "Markdown file will be created after the first save."}
                </p>
              </div>

              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-full bg-teal-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                disabled={saveMutation.isPending || postQuery.isLoading}
              >
                {saveMutation.isPending ? "Saving..." : "Save post"}
              </button>
            </section>
          </form>
        </div>

        <div className={panel === "editor" ? "hidden xl:block" : ""}>
          <section
            className="space-y-5 rounded-3xl border border-white/10 bg-white/5 p-6"
            data-preview-platform={previewPlatform}
          >
            <div className="flex flex-col gap-4 border-b border-white/10 pb-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-white">Preview</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Live render updates after {PREVIEW_DEBOUNCE_MS}ms debounce
                    and reflects the selected target platform.
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
                          ? "border-teal-400/70 bg-teal-400/15 text-teal-100"
                          : "border-white/10 bg-white/5 text-slate-300",
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
                  {previewCharCount} chars
                </span>
                <PresenceBadge
                  label={previewQuery.isFetching ? "Updating" : "Live"}
                  active={!previewQuery.isFetching}
                />
                <PresenceBadge
                  label={`Issues ${previewIssues.length}`}
                  active={previewIssues.length > 0}
                />
              </div>
            </div>

            {previewQuery.isLoading ? (
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-5 text-sm text-slate-300">
                Building preview from draft payload...
              </div>
            ) : null}

            {previewQuery.isError ? (
              <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-5 text-sm text-rose-100">
                Preview request failed. Keep editing and retry after the next
                valid payload.
              </div>
            ) : null}

            {previewQuery.data ? (
              <div className="space-y-5">
                <div
                  className={[
                    "rounded-[28px] border p-5 shadow-xl",
                    previewPlatform === "telegram"
                      ? "border-cyan-400/20 bg-gradient-to-br from-cyan-400/12 to-slate-950/80"
                      : "border-indigo-400/20 bg-gradient-to-br from-indigo-400/12 to-slate-950/80",
                  ].join(" ")}
                >
                  <div className="mb-4 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-slate-400">
                    <span>
                      {previewPlatform === "telegram"
                        ? "Telegram render"
                        : "VK render"}
                    </span>
                    <span>{previewQuery.data.platform ?? previewPlatform}</span>
                  </div>

                  {previewPlatform === "telegram" ? (
                    <div
                      data-preview-body="telegram"
                      className="space-y-3 rounded-[24px] bg-slate-950/70 p-5 text-sm leading-7 text-slate-100"
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
                      className="whitespace-pre-wrap rounded-[24px] bg-slate-950/70 p-5 text-sm leading-7 text-slate-100"
                    >
                      {previewQuery.data.rendered_text}
                    </pre>
                  )}
                </div>

                {previewQuery.data.poll ? (
                  <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                        Poll preview
                      </h4>
                      <PresenceBadge label="Poll" />
                    </div>
                    <p className="mt-4 text-base font-semibold text-white">
                      {previewQuery.data.poll.question}
                    </p>
                    <div className="mt-4 grid gap-2">
                      {previewQuery.data.poll.options.map((option) => (
                        <div
                          key={option}
                          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
                        >
                          {option}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {formValues.hasImage || formValues.imagePrompt.trim() ? (
                  <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                        Image preview
                      </h4>
                      <PresenceBadge
                        label={formValues.hasImage ? "Attached" : "Prompt ready"}
                      />
                    </div>
                    <div className="mt-4 overflow-hidden rounded-[24px] border border-dashed border-white/10 bg-gradient-to-br from-white/5 to-transparent">
                      {imagePreviewUrl ? (
                        <img
                          className="h-[260px] w-full object-cover"
                          src={imagePreviewUrl}
                          alt={`Preview for ${generatedImageName}`}
                        />
                      ) : (
                        <div className="p-8 text-center text-sm text-slate-400">
                          Image prompt is ready; upload or generate to attach
                          the final asset.
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}

                <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                      Validation
                    </h4>
                    <span
                      className="text-sm text-slate-400"
                      data-validation-count={previewIssues.length}
                    >
                      {previewIssues.length} issues
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
                              {issue.level}
                            </span>
                            <span className="text-xs uppercase tracking-[0.14em] opacity-70">
                              {issue.code}
                            </span>
                          </div>
                          <p className="mt-2 leading-6">{issue.message}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-slate-400">
                      No validation issues for the current preview payload.
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
