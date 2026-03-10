import { useEffect, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";

import { apiFetch } from "../api/client";
import { PlatformBadge } from "../components/PlatformBadge";
import { PresenceBadge } from "../components/PresenceBadge";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/ToastProvider";
import type {
  Platform,
  PollData,
  PreviewResponse,
  PostDetail,
  PublishStatus,
  ValidationIssue,
} from "../types";

const DEFAULT_USERNAMES: Record<Platform, string> = {
  telegram: "@biovoltru",
  vk: "@biovolt",
};
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
  const [panel, setPanel] = useState<"editor" | "preview">("editor");
  const [formValues, setFormValues] = useState<PostEditorFormValues>(() =>
    buildEmptyForm(),
  );
  const [initialSnapshot, setInitialSnapshot] = useState(() =>
    buildComparableSnapshot(buildEmptyForm()),
  );
  const [hashtagInput, setHashtagInput] = useState("");
  const [imagePromptExpanded, setImagePromptExpanded] = useState(false);
  const [previewPlatform, setPreviewPlatform] = useState<Platform>("telegram");
  const [debouncedPreviewSignature, setDebouncedPreviewSignature] = useState(() =>
    JSON.stringify(buildPreviewPayload(buildEmptyForm(), "telegram", undefined)),
  );

  const postQuery = useQuery({
    queryKey: ["post", filename],
    queryFn: () => apiFetch<PostDetail>(`/posts/${filename}`),
    enabled: Boolean(filename),
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!filename) {
      const emptyForm = buildEmptyForm();
      setFormValues(emptyForm);
      setInitialSnapshot(buildComparableSnapshot(emptyForm));
      setImagePromptExpanded(false);
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
    setPreviewPlatform(nextForm.platform);
  }, [filename, postQuery.data]);

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

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedPreviewSignature(previewSignature);
    }, PREVIEW_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [previewSignature]);

  const previewQuery = useQuery({
    queryKey: ["preview", debouncedPreviewSignature],
    queryFn: () =>
      apiFetch<PreviewResponse>("/preview", {
        method: "POST",
        body: debouncedPreviewSignature,
      }),
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveMutation.mutateAsync();
  }

  const editorTitle = formatEditorTitle(filename);
  const pollOptionCount = formValues.pollOptions.filter((option) => option.trim()).length;
  const previewIssues = previewQuery.data?.validation ?? [];
  const previewCharCount = previewQuery.data?.char_count ?? 0;

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
              <StatusBadge status={formValues.status} />
              <PlatformBadge platform={formValues.platform} />
              <PresenceBadge label="Unsaved" active={isDirty} />
              <PresenceBadge label="Image" active={formValues.hasImage} />
              <PresenceBadge label="Poll" active={formValues.pollEnabled} />
            </div>

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
                    Prompt text is stored now; image generation UI lands in
                    `#23`.
                  </p>
                </div>

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

              {imagePromptExpanded ? (
                <div className="mt-5 space-y-3">
                  <FieldShell label="Prompt">
                    <textarea
                      className="min-h-[180px] rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-teal-400/60"
                      value={formValues.imagePrompt}
                      placeholder="Describe the desired image"
                      onChange={(event) =>
                        setFieldValue("imagePrompt", event.target.value)
                      }
                    />
                  </FieldShell>

                  {formValues.imagePrompt ? (
                    <button
                      type="button"
                      className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/10"
                      onClick={() => setFieldValue("imagePrompt", "")}
                    >
                      Clear prompt
                    </button>
                  ) : null}
                </div>
              ) : (
                <p className="mt-5 text-sm text-slate-500">
                  {formValues.imagePrompt
                    ? "Prompt is stored but the section is collapsed."
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
                    <div className="mt-4 rounded-[24px] border border-dashed border-white/10 bg-gradient-to-br from-white/5 to-transparent p-8 text-center text-sm text-slate-400">
                      {formValues.hasImage
                        ? "Image file is attached to this draft."
                        : "Image prompt is ready; generation UI lands in #23."}
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
    </div>
  );
}
