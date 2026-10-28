import {
  ArrowDownLeftIcon,
  ArrowDownRightIcon,
  ArrowBendUpLeftIcon,
  ArrowRightIcon,
  AtIcon,
  ArrowUpLeftIcon,
  ArrowUpRightIcon,
  ChatsIcon,
  CheckCircleIcon,
  CheckIcon,
  CopySimpleIcon,
  GearSixIcon,
  ShieldCheckIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type Variants,
} from "motion/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import useMeasure from "react-use-measure";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemContent, ItemHeader } from "@/components/ui/item";
import { Kbd } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import logo from "@/logo.svg";
import type { AnnotationComment, AnnotationPosition, ForYouEntry } from "../types";
import {
  getStorageKey,
  readStoredBoolean,
  readStoredString,
  writeStoredBoolean,
  writeStoredString,
} from "../storage";
import { useAnnotation } from "../useAnnotation";
import {
  formatAnnotationCollectionMarkdown,
  formatAnnotationThreadMarkdown,
  formatTimestamp,
  getForYouHref,
  getReplies,
  getTopLevelComments,
  isValidName,
} from "../utils";
import { MentionText } from "./MentionText";

type CopyState = "idle" | "copied" | "error";

type ResolveSliderIconState = "idle" | "loading";

type ResolveAllSliderProps = {
  onResolveAll: () => Promise<boolean>;
};

type ThreadCardProps = {
  activeThreadId: string | null;
  comment: AnnotationComment;
  comments: AnnotationComment[];
  currentPath: string;
};

const RESOLVE_ALL_COMPLETE_THRESHOLD = 0.96;
const DEFAULT_POSITION: AnnotationPosition = "bottom-right";
const POSITION_OPTIONS: Array<{ icon: ReactNode; value: AnnotationPosition }> = [
  { icon: <ArrowUpLeftIcon />, value: "top-left" },
  { icon: <ArrowUpRightIcon />, value: "top-right" },
  { icon: <ArrowDownLeftIcon />, value: "bottom-left" },
  { icon: <ArrowDownRightIcon />, value: "bottom-right" },
];

function isAnnotationPosition(value: string): value is AnnotationPosition {
  return POSITION_OPTIONS.some((option) => option.value === value);
}

function readStoredPosition(key: string, fallback: AnnotationPosition): AnnotationPosition {
  const value = readStoredString(key);
  return isAnnotationPosition(value) ? value : fallback;
}

function getPositionConfig(position: AnnotationPosition) {
  const isLeft = position.endsWith("left");
  const isTop = position.startsWith("top");

  return {
    anchorX: isLeft ? "left" : "right",
    anchorY: isTop ? "top" : "bottom",
    buttonTransformOrigin: isLeft ? "center left" : "center right",
    cardOffset: isTop ? -10 : 10,
    rootClassName: cn(
      "annotation:fixed annotation:z-2147483602 annotation:flex annotation:gap-4",
      isTop
        ? "annotation:top-6 annotation:flex-col-reverse"
        : "annotation:bottom-6 annotation:flex-col",
      isLeft
        ? "annotation:left-6 annotation:items-start"
        : "annotation:right-6 annotation:items-end",
    ),
    toolbarOriginClassName: (() => {
      if (position === "top-left") {
        return "annotation:origin-top-left";
      }

      if (position === "top-right") {
        return "annotation:origin-top-right";
      }

      if (position === "bottom-left") {
        return "annotation:origin-bottom-left";
      }

      return "annotation:origin-bottom-right";
    })(),
  } as const;
}

function useCopyState() {
  const [state, setState] = useState<CopyState>("idle");

  useEffect(() => {
    if (state === "idle") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setState("idle");
    }, 2000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [state]);

  return [state, setState] as const;
}

async function copyToClipboard(value: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function getCopyActionIcon(state: CopyState) {
  if (state === "copied") {
    return <CheckIcon />;
  }

  if (state === "error") {
    return <XIcon />;
  }

  return <CopySimpleIcon />;
}

function getResolveSliderIcon(state: ResolveSliderIconState) {
  if (state === "loading") {
    return <Spinner className="annotation:size-4" />;
  }

  return <ArrowRightIcon className="annotation:size-4" />;
}

function stopItemClick(event: MouseEvent<HTMLButtonElement>): void {
  event.preventDefault();
  event.stopPropagation();
}

function AnimatedIconTransition<T extends string>({
  renderIcon,
  state,
}: {
  renderIcon: (state: T) => ReactNode;
  state: T;
}) {
  return (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.div
        className="annotation:flex annotation:items-center annotation:justify-center"
        animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
        exit={{ opacity: 0, filter: "blur(5px)", scale: 0.5 }}
        initial={{ opacity: 0, filter: "blur(5px)", scale: 0.5 }}
        key={state}
      >
        {renderIcon(state)}
      </motion.div>
    </AnimatePresence>
  );
}

function AnimatedCopyStateIcon({ state }: { state: CopyState }) {
  return <AnimatedIconTransition renderIcon={getCopyActionIcon} state={state} />;
}

type AdminTab = "project" | "link" | "staff";

const ADMIN_TABS: Array<{ label: string; value: AdminTab }> = [
  { label: "Project", value: "project" },
  { label: "Guest link", value: "link" },
  { label: "Staff", value: "staff" },
];

type AdminProject = { id: string; name: string; domains: string[]; link_key: string | null };

// Links lead to the current page; the key goes into the fragment like in the admin script.
function linkTo(key: string) {
  const target = new URL(window.location.origin + window.location.pathname);
  target.hash = `key=${key}`;
  return target.toString();
}

function CopyLink({ url }: { url: string }) {
  const [copyState, setCopyState] = useCopyState();

  return (
    <div className="annotation:flex annotation:gap-2">
      <Input aria-label="Link" onFocus={(event) => event.target.select()} readOnly value={url} />
      <Button
        aria-label="Copy link"
        onClick={() =>
          void copyToClipboard(url).then((ok) => setCopyState(ok ? "copied" : "error"))
        }
        size="icon"
        type="button"
        variant="outline"
      >
        <AnimatedCopyStateIcon state={copyState} />
      </Button>
    </div>
  );
}

function AdminCard() {
  const { callAdmin, projectId } = useAnnotation();
  const [tab, setTab] = useState<AdminTab>("project");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [guestLink, setGuestLink] = useState("");
  // null: never asked; false: asked and closed, so "New link" takes the focus back.
  const [confirmingLink, setConfirmingLink] = useState<boolean | null>(null);
  const [staffLink, setStaffLink] = useState("");
  const [project, setProject] = useState({
    id: projectId ?? "",
    name: "",
    domains: window.location.host,
  });
  const [staff, setStaff] = useState({ email: "", firstName: "", lastName: "" });
  // In a project, Save waits for the stored domains so it never replaces them with location.host.
  const [loaded, setLoaded] = useState(!projectId);

  // Also without a project: the call checks the admin flag when the tile opens.
  useEffect(() => {
    let isActive = true;
    void callAdmin("annotation_admin_project", { p_project_id: projectId }).then(
      ({ data, error }) => {
        const row = (data as AdminProject[] | null)?.[0];
        if (!isActive) {
          return;
        }
        setError(error?.message ?? null);
        if (row) {
          setProject({ id: row.id, name: row.name, domains: row.domains.join(", ") });
          // Links created before the key was stored have none; then only "New link" is offered.
          setGuestLink(row.link_key ? linkTo(row.link_key) : "");
          setLoaded(true);
        }
      },
    );
    return () => {
      isActive = false;
    };
  }, [callAdmin, projectId]);

  const run = async (action: () => Promise<void>) => {
    setIsBusy(true);
    setError(null);
    setSaved(false);
    try {
      await action();
    } finally {
      setIsBusy(false);
    }
  };

  const saveProject = () =>
    run(async () => {
      const { error } = await callAdmin("annotation_admin_set_project", {
        p_host: window.location.host,
        p_id: project.id.trim(),
        p_name: project.name.trim(),
        p_domains: project.domains.split(/[\s,]+/).filter(Boolean),
      });
      setError(error?.message ?? null);
      setSaved(!error);
    });

  const createGuestLink = () =>
    run(async () => {
      setConfirmingLink(false);
      const { data, error } = await callAdmin("annotation_admin_new_project_key", {
        p_project_id: projectId,
      });
      setError(error?.message ?? null);
      if (typeof data === "string") {
        setGuestLink(linkTo(data));
      }
    });

  const addStaff = () =>
    run(async () => {
      setStaffLink("");
      const { data, error } = await callAdmin("annotation_admin_add_staff", {
        p_email: staff.email,
        p_first_name: staff.firstName,
        p_last_name: staff.lastName.trim() || null,
      });
      setError(error?.message ?? null);
      const key = (data as Array<{ key: string }> | null)?.[0]?.key;
      if (key) {
        setStaffLink(linkTo(key));
        setStaff({ email: "", firstName: "", lastName: "" });
      }
    });

  const canSaveProject =
    Boolean(project.id.trim() && project.name.trim() && project.domains.trim()) &&
    loaded &&
    !isBusy;
  const canAddStaff =
    Boolean(staff.email.trim() && staff.firstName.trim()) &&
    isValidName(`${staff.firstName} ${staff.lastName}`) &&
    !isBusy;

  return (
    <Card className="annotation:w-72">
      <CardHeader>
        <div className="annotation:grid annotation:grid-cols-3 annotation:gap-1">
          {ADMIN_TABS.map((option) => (
            <Button
              aria-pressed={tab === option.value}
              disabled={option.value === "link" && !projectId}
              key={option.value}
              onClick={() => {
                setTab(option.value);
                setConfirmingLink(null);
                setError(null);
                setSaved(false);
              }}
              size="xs"
              type="button"
              variant={tab === option.value ? "secondary" : "outline"}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {tab === "project" ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (canSaveProject) {
                void saveProject();
              }
            }}
          >
            <FieldGroup className="annotation:gap-3">
              <Field>
                <FieldLabel htmlFor="annotation-admin-id">ID</FieldLabel>
                <Input
                  id="annotation-admin-id"
                  onChange={(event) => {
                    setSaved(false);
                    setProject({ ...project, id: event.target.value });
                  }}
                  placeholder="marketing-site"
                  disabled={Boolean(projectId)}
                  value={project.id}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="annotation-admin-name">Name</FieldLabel>
                <Input
                  id="annotation-admin-name"
                  maxLength={120}
                  onChange={(event) => {
                    setSaved(false);
                    setProject({ ...project, name: event.target.value });
                  }}
                  value={project.name}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="annotation-admin-domains">Domains</FieldLabel>
                <Input
                  id="annotation-admin-domains"
                  onChange={(event) => {
                    setSaved(false);
                    setProject({ ...project, domains: event.target.value });
                  }}
                  value={project.domains}
                />
              </Field>
              <Button disabled={!canSaveProject} size="sm" type="submit">
                {saved ? <CheckIcon /> : null}
                {saved ? "Saved" : "Save"}
              </Button>
            </FieldGroup>
          </form>
        ) : null}
        {tab === "link" ? (
          <FieldGroup className="annotation:gap-3">
            <div className="annotation:flex annotation:flex-col annotation:items-start annotation:gap-2">
              <Badge variant="secondary">{projectId}</Badge>
            </div>
            {guestLink ? <CopyLink url={guestLink} /> : null}
            {confirmingLink ? (
              <div
                className="annotation:flex annotation:flex-col annotation:gap-2"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setConfirmingLink(false);
                  }
                }}
                aria-describedby="annotation-admin-link-confirm"
                role="group"
              >
                <p
                  className="annotation:text-sm annotation:text-muted-foreground"
                  id="annotation-admin-link-confirm"
                >
                  The current link and every guest who joined through it lose access right away.
                </p>
                <div className="annotation:grid annotation:grid-cols-2 annotation:gap-2">
                  <Button
                    autoFocus
                    onClick={() => setConfirmingLink(false)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={isBusy}
                    onClick={() => void createGuestLink()}
                    size="sm"
                    type="button"
                    variant="destructive"
                  >
                    Confirm
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                autoFocus={confirmingLink === false}
                disabled={isBusy}
                onClick={() => setConfirmingLink(true)}
                size="sm"
                type="button"
              >
                New link
              </Button>
            )}
          </FieldGroup>
        ) : null}
        {tab === "staff" ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (canAddStaff) {
                void addStaff();
              }
            }}
          >
            <FieldGroup className="annotation:gap-3">
              <Field>
                <FieldLabel htmlFor="annotation-admin-email">Email</FieldLabel>
                <Input
                  id="annotation-admin-email"
                  onChange={(event) => setStaff({ ...staff, email: event.target.value })}
                  placeholder="name@dayone.de"
                  type="email"
                  value={staff.email}
                />
              </Field>
              <div className="annotation:grid annotation:grid-cols-2 annotation:gap-2">
                <Field>
                  <FieldLabel htmlFor="annotation-admin-first-name">First name</FieldLabel>
                  <Input
                    id="annotation-admin-first-name"
                    maxLength={48}
                    onChange={(event) => setStaff({ ...staff, firstName: event.target.value })}
                    value={staff.firstName}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="annotation-admin-last-name">Last name</FieldLabel>
                  <Input
                    id="annotation-admin-last-name"
                    maxLength={48}
                    onChange={(event) => setStaff({ ...staff, lastName: event.target.value })}
                    placeholder="Optional"
                    value={staff.lastName}
                  />
                </Field>
              </div>
              {staffLink ? <CopyLink url={staffLink} /> : null}
              <Button disabled={!canAddStaff} size="sm" type="submit">
                Add
              </Button>
            </FieldGroup>
          </form>
        ) : null}
        {error ? (
          <div
            className="annotation:mt-4 annotation:rounded-xl annotation:border annotation:border-destructive/30 annotation:bg-destructive/10 annotation:px-3 annotation:py-2 annotation:text-sm annotation:text-destructive"
            role="alert"
          >
            {error}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ThreadCard({ activeThreadId, comment, comments, currentPath }: ThreadCardProps) {
  const { openThread, toggleResolved } = useAnnotation();
  const [copyState, setCopyState] = useCopyState();
  const replies = getReplies(comments, comment.id);
  const isActive = activeThreadId === comment.id;

  const handleCopy = useCallback(async () => {
    const markdown = formatAnnotationThreadMarkdown(comment, comments, currentPath);
    const didCopy = await copyToClipboard(markdown);
    setCopyState(didCopy ? "copied" : "error");
  }, [comment, comments, currentPath, setCopyState]);

  return (
    <Item
      className={cn(
        "annotation:group annotation:bg-background annotation:transition-all",
        isActive && "annotation:border annotation:border-primary",
        comment.resolved && "annotation:opacity-50",
      )}
      onClick={() => openThread(comment.id)}
      size="xs"
      variant="outline"
    >
      <ItemHeader className="annotation:flex annotation:items-center annotation:justify-between annotation:gap-2">
        <Badge variant="secondary">{comment.page_path}</Badge>
        <div className="annotation:flex annotation:items-center annotation:gap-0 annotation:opacity-0 annotation:transition-opacity annotation:duration-150 annotation:group-hover:opacity-100">
          <Button
            onClick={(event) => {
              stopItemClick(event);
              void handleCopy();
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <AnimatedCopyStateIcon state={copyState} />
          </Button>
          <Button
            aria-label={comment.resolved ? "Mark annotation as open" : "Resolve annotation"}
            onClick={(event) => {
              stopItemClick(event);
              void toggleResolved(comment.id);
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            {comment.resolved ? <CheckCircleIcon weight="fill" /> : <CheckCircleIcon />}
          </Button>
        </div>
      </ItemHeader>
      <ItemContent className="annotation:flex annotation:flex-col annotation:gap-2 annotation:text-sm">
        <div className="annotation:flex annotation:flex-col">
          <p className="annotation:flex annotation:items-center annotation:gap-1.5 annotation:font-medium">
            {comment.author}
            {comment.author_is_guest ? <Badge variant="outline">External</Badge> : null}
          </p>
          <p className="annotation:whitespace-pre-wrap annotation:text-muted-foreground">
            <MentionText mentions={comment.mentions} text={comment.text} />
          </p>
        </div>
        <div className="annotation:flex annotation:justify-between annotation:gap-2 annotation:text-xs annotation:text-muted-foreground">
          <span>
            {replies.length > 0 &&
              `${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
          </span>
          <span>{formatTimestamp(comment.created_at)}</span>
        </div>
      </ItemContent>
    </Item>
  );
}

// Same project: open the thread here. Other project: link to its page, which opens the thread there.
// Without a domain the entry only names the project.
function ForYouCard({ entry }: { entry: ForYouEntry }) {
  const { openThread, projectId } = useAnnotation();
  const isHere = entry.project_id === projectId;
  const href = isHere
    ? null
    : getForYouHref(entry.project_domain, entry.page_path, entry.thread_id);
  const body = (
    <>
      <ItemHeader className="annotation:justify-start annotation:gap-1">
        {isHere ? null : <Badge variant="outline">{entry.project_name}</Badge>}
        <Badge variant="secondary">{entry.page_path}</Badge>
      </ItemHeader>
      <ItemContent className="annotation:flex-row annotation:flex-wrap annotation:items-center annotation:justify-between annotation:gap-x-2 annotation:text-sm">
        <span className="annotation:flex annotation:items-center annotation:gap-1.5">
          {entry.is_read ? null : (
            <span
              aria-label="Unread"
              className="annotation:size-2 annotation:shrink-0 annotation:rounded-full annotation:bg-primary-foreground"
              role="img"
            />
          )}
          <span className="annotation:font-medium">{entry.actor_name}</span>
          {entry.kind === "mention" ? (
            <AtIcon
              aria-label="Mentioned you"
              className="annotation:shrink-0 annotation:text-muted-foreground"
            />
          ) : (
            <ArrowBendUpLeftIcon
              aria-label="Replied"
              className="annotation:shrink-0 annotation:text-muted-foreground"
            />
          )}
        </span>
        <span className="annotation:shrink-0 annotation:text-xs annotation:text-muted-foreground">
          {formatTimestamp(entry.created_at)}
        </span>
      </ItemContent>
    </>
  );
  // Links keep the card look; host pages may style <a>.
  const className =
    "annotation:bg-background annotation:text-left annotation:text-foreground annotation:no-underline";

  if (isHere) {
    return (
      <Item asChild className={className} size="xs" variant="outline">
        <button onClick={() => openThread(entry.thread_id)} type="button">
          {body}
        </button>
      </Item>
    );
  }
  if (href) {
    return (
      <Item asChild className={className} size="xs" variant="outline">
        <a href={href}>{body}</a>
      </Item>
    );
  }
  return (
    <Item className={className} size="xs" variant="outline">
      {body}
    </Item>
  );
}

function ResolveAllSlider({ onResolveAll }: ResolveAllSliderProps) {
  const [isResolving, setIsResolving] = useState(false);
  const trackNodeRef = useRef<HTMLDivElement | null>(null);
  const thumbNodeRef = useRef<HTMLButtonElement | null>(null);
  const [measureTrackRef, { width: measuredTrackWidth }] = useMeasure({ offsetSize: true });
  const [measureThumbRef, { width: measuredThumbWidth }] = useMeasure({ offsetSize: true });
  const x = useMotionValue(0);
  const setTrackRef = useCallback(
    (node: HTMLDivElement | null) => {
      trackNodeRef.current = node;
      measureTrackRef(node);
    },
    [measureTrackRef],
  );
  const setThumbRef = useCallback(
    (node: HTMLButtonElement | null) => {
      thumbNodeRef.current = node;
      measureThumbRef(node);
    },
    [measureThumbRef],
  );
  const trackWidth = trackNodeRef.current?.clientWidth ?? measuredTrackWidth;
  const thumbWidth = thumbNodeRef.current?.offsetWidth ?? measuredThumbWidth;
  const maxDrag = Math.max(trackWidth - thumbWidth, 0);
  const progressWidth = useTransform(x, (latest) =>
    Math.min(Math.max(latest + thumbWidth / 2, 0), trackWidth),
  );

  const moveThumbToEnd = useCallback(() => {
    void animate(x, maxDrag, {
      type: "spring",
      stiffness: 560,
      damping: 42,
      mass: 0.4,
    });
  }, [maxDrag, x]);

  const resetThumb = useCallback(() => {
    void animate(x, 0, {
      type: "spring",
      stiffness: 560,
      damping: 42,
      mass: 0.4,
    });
  }, [x]);

  const runResolveAll = useCallback(async () => {
    const startedAt = performance.now();

    setIsResolving(true);
    moveThumbToEnd();

    try {
      await onResolveAll();

      const elapsed = performance.now() - startedAt;
      const remaining = Math.max(0, 2000 - elapsed);

      if (remaining > 0) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, remaining);
        });
      }
    } finally {
      setIsResolving(false);
      resetThumb();
    }
  }, [moveThumbToEnd, onResolveAll, resetThumb]);

  useEffect(() => {
    if (isResolving) {
      x.set(maxDrag);
      return;
    }

    if (x.get() > maxDrag) {
      x.set(maxDrag);
    }
  }, [isResolving, maxDrag, x]);

  const handleDragEnd = useCallback(() => {
    const completion = maxDrag <= 0 ? 0 : x.get() / maxDrag;

    if (isResolving) {
      return;
    }

    if (completion < RESOLVE_ALL_COMPLETE_THRESHOLD) {
      resetThumb();
      return;
    }

    void runResolveAll();
  }, [isResolving, maxDrag, resetThumb, runResolveAll, x]);
  const resolveSliderIconState: ResolveSliderIconState = isResolving ? "loading" : "idle";

  return (
    <div
      className="annotation:relative annotation:box-content annotation:h-6 annotation:overflow-hidden annotation:rounded-full annotation:border annotation:bg-muted"
      ref={setTrackRef}
    >
      <motion.div
        aria-hidden
        className="annotation:absolute annotation:inset-y-0 annotation:left-0 annotation:rounded-full annotation:bg-primary"
        style={{
          width: progressWidth,
        }}
      />
      <motion.button
        aria-label="Resolve all"
        className={cn(
          "annotation:relative annotation:z-10 annotation:flex annotation:size-6 annotation:items-center annotation:justify-center annotation:rounded-full annotation:bg-background annotation:shadow-sm annotation:ring-1 annotation:ring-border annotation:transition-colors",
          !isResolving && "annotation:cursor-grab annotation:active:cursor-grabbing",
        )}
        disabled={isResolving}
        drag={isResolving ? false : "x"}
        dragConstraints={{ left: 0, right: maxDrag }}
        dragElastic={0}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        ref={setThumbRef}
        style={{ x }}
        type="button"
        whileTap={isResolving ? undefined : { scale: 0.98 }}
      >
        <AnimatedIconTransition renderIcon={getResolveSliderIcon} state={resolveSliderIconState} />
      </motion.button>
    </div>
  );
}

export function AnnotationDock({
  defaultPosition = DEFAULT_POSITION,
}: {
  defaultPosition?: AnnotationPosition;
}) {
  const {
    activeThreadId,
    annotationMode,
    author,
    cancelAnnotationMode,
    comments,
    composer,
    currentPath,
    errorMessage,
    forYou,
    isAdmin,
    isGuest,
    isJoining,
    joinAsGuest,
    markAllRead,
    phase,
    isLoading,
    renameSelf,
    resolveAllComments,
    setShowResolved,
    showResolved,
    startAnnotationMode,
    storageKeyPrefix,
  } = useAnnotation();
  const onlyCurrentPageKey = useMemo(
    () => getStorageKey(storageKeyPrefix, "only_current_page"),
    [storageKeyPrefix],
  );
  const positionKey = useMemo(
    () => getStorageKey(storageKeyPrefix, "position"),
    [storageKeyPrefix],
  );
  const [showOnlyCurrentPage, setShowOnlyCurrentPage] = useState(() =>
    readStoredBoolean(onlyCurrentPageKey, false),
  );
  const [position, setPosition] = useState<AnnotationPosition>(() =>
    readStoredPosition(positionKey, defaultPosition),
  );
  const [isPanelOpen, setPanelOpen] = useState(false);
  const [showForYou, setShowForYou] = useState(false);
  const unreadCount = forYou.filter((entry) => !entry.is_read).length;
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(author);
  const [joinName, setJoinName] = useState("");
  const trimmedJoinName = joinName.trim();
  const canJoin = isValidName(trimmedJoinName);
  const trimmedNameDraft = nameDraft.trim();
  const canSaveName = isValidName(trimmedNameDraft) && trimmedNameDraft !== author;
  const [bulkCopyState, setBulkCopyState] = useCopyState();

  const [refContainer, { height, width }] = useMeasure();

  const topLevelComments = getTopLevelComments(comments);
  const sortedThreads = [...topLevelComments].sort((left, right) =>
    right.created_at.localeCompare(left.created_at),
  );
  const showAllPages = !showOnlyCurrentPage;
  const pageScopedThreads = showAllPages
    ? sortedThreads
    : sortedThreads.filter((comment) => comment.page_path === currentPath);
  const visibleThreads = pageScopedThreads.filter((comment) => showResolved || !comment.resolved);
  const currentRouteOpenThreads = sortedThreads.filter(
    (comment) => comment.page_path === currentPath && !comment.resolved,
  );
  const unresolvedThreadCount = topLevelComments.filter((comment) => !comment.resolved).length;
  const positionConfig = useMemo(() => getPositionConfig(position), [position]);

  const variantsButton = useMemo(
    () =>
      ({
        initial: { opacity: 0, filter: "blur(10px)", transform: "scale(0.75)" },
        animate: {
          opacity: 1,
          filter: "blur(0px)",
          transform: "scale(1)",
          transformOrigin: positionConfig.buttonTransformOrigin,
          transition: { duration: 0.4, ease: [0.17, 0.84, 0.44, 1] },
        },
        exit: {
          opacity: 0,
          filter: "blur(10px)",
          transform: "scale(0.75)",
          transformOrigin: positionConfig.buttonTransformOrigin,
          transition: { duration: 0.4, ease: [0.17, 0.84, 0.44, 1] },
        },
      }) satisfies Variants,
    [positionConfig.buttonTransformOrigin],
  );

  const variantsCard = useMemo(
    () =>
      ({
        initial: {
          opacity: 0,
          transform: `translateY(${positionConfig.cardOffset}px)`,
        },
        animate: {
          opacity: 1,
          transform: "translateY(0)",
          transition: {
            duration: 0.25,
            ease: [0.17, 0.84, 0.44, 1],
          },
        },
        exit: {
          opacity: 0,
          transform: "translateY(0px)",
          transition: {
            duration: 0.15,
            ease: [0.17, 0.84, 0.44, 1],
          },
        },
      }) satisfies Variants,
    [positionConfig.cardOffset],
  );

  useEffect(() => {
    setShowOnlyCurrentPage(readStoredBoolean(onlyCurrentPageKey, false));
  }, [onlyCurrentPageKey]);

  useEffect(() => {
    setPosition(readStoredPosition(positionKey, defaultPosition));
  }, [defaultPosition, positionKey]);

  useEffect(() => {
    if (!annotationMode) {
      setIsSettingsOpen(false);
      setPanelOpen(false);
      setIsAdminOpen(false);
    }
  }, [annotationMode]);

  useEffect(() => {
    if (isSettingsOpen) {
      setNameDraft(author);
    }
  }, [author, isSettingsOpen]);

  useEffect(() => {
    if (composer && !composer.parentId) {
      setPanelOpen(false);
    }
  }, [composer]);

  const toggleAnnotationsPanel = useCallback(() => {
    setIsSettingsOpen(false);
    setIsAdminOpen(false);
    setPanelOpen((open) => !open);
  }, []);

  const toggleAdmin = useCallback(() => {
    setIsSettingsOpen(false);
    setPanelOpen(false);
    setIsAdminOpen((open) => !open);
  }, []);

  const closeAnnotationDock = useCallback(() => {
    setIsSettingsOpen(false);
    setIsAdminOpen(false);
    cancelAnnotationMode();
  }, [cancelAnnotationMode]);

  const adminButton = isAdmin ? (
    <Button aria-expanded={isAdminOpen} aria-label="Admin" onClick={toggleAdmin} size="icon-sm">
      <ShieldCheckIcon />
    </Button>
  ) : null;

  const handleBulkCopy = useCallback(async () => {
    const markdown = formatAnnotationCollectionMarkdown(
      currentRouteOpenThreads,
      comments,
      currentPath,
    );
    const didCopy = await copyToClipboard(markdown);
    setBulkCopyState(didCopy ? "copied" : "error");
  }, [comments, currentPath, currentRouteOpenThreads, setBulkCopyState]);

  const renderDock = () => {
    // Guest with a project link: only a name, then they are in the project.
    if (phase === "join") {
      return (
        <motion.form
          animate="animate"
          className="annotation:flex annotation:max-w-72 annotation:flex-wrap annotation:items-center annotation:gap-2 annotation:p-1"
          exit="exit"
          initial="initial"
          key="floating-button-join"
          onSubmit={(event) => {
            event.preventDefault();
            if (canJoin) {
              void joinAsGuest(trimmedJoinName);
            }
          }}
          variants={variantsButton}
        >
          <Input
            aria-label="Your name"
            autoFocus
            className="annotation:w-48 annotation:border-none annotation:bg-primary-foreground/10 annotation:text-primary-foreground annotation:placeholder:text-primary-foreground/50"
            id="annotation-join-name"
            maxLength={48}
            onChange={(event) => setJoinName(event.target.value)}
            placeholder="What's your name?"
            value={joinName}
          />
          <Button aria-label="Join" disabled={!canJoin || isJoining} size="icon-sm" type="submit">
            <CheckIcon />
          </Button>
          {errorMessage ? (
            <p
              className="annotation:basis-full annotation:px-1 annotation:text-xs annotation:text-primary-foreground"
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}
        </motion.form>
      );
    }

    // Admin on a page without a project: only the admin tile, to create the project.
    if (phase === "admin") {
      return (
        <motion.div
          animate="animate"
          className="annotation:flex annotation:items-center annotation:p-1"
          exit="exit"
          initial="initial"
          key="floating-button-admin"
          variants={variantsButton}
        >
          {adminButton}
        </motion.div>
      );
    }

    if (!annotationMode) {
      return (
        <motion.div
          animate="animate"
          className="annotation:flex annotation:items-center annotation:gap-2"
          exit="exit"
          initial="initial"
          key="floating-button"
          variants={variantsButton}
        >
          <Button className="annotation:pr-1" onClick={() => startAnnotationMode()} size="sm">
            Annotation
            <Kbd className="annotation:bg-primary-foreground/15 annotation:text-primary-foreground">
              C
            </Kbd>
          </Button>
          {/* The tile stays open after an admin created this page's project; it closes here. */}
          {isAdminOpen ? adminButton : null}
        </motion.div>
      );
    }

    return (
      <motion.div
        animate="animate"
        className={cn(
          "annotation:flex annotation:items-center annotation:gap-2 annotation:p-1",
          positionConfig.toolbarOriginClassName,
        )}
        exit="exit"
        initial="initial"
        key="floating-button-active"
        variants={variantsButton}
      >
        <Button
          disabled={currentRouteOpenThreads.length === 0}
          onClick={() => void handleBulkCopy()}
          size="icon-sm"
        >
          <AnimatedCopyStateIcon state={bulkCopyState} />
        </Button>
        <Button
          aria-expanded={isPanelOpen}
          aria-label="Annotations panel"
          onClick={toggleAnnotationsPanel}
          size={unreadCount > 0 ? "sm" : "icon-sm"}
        >
          <ChatsIcon />
          {unreadCount > 0 ? unreadCount : null}
        </Button>
        <Button
          aria-expanded={isSettingsOpen}
          aria-label="Annotation settings"
          onClick={() => {
            setIsAdminOpen(false);
            setIsSettingsOpen((open) => {
              const next = !open;
              if (next) {
                setPanelOpen(false);
              }
              return next;
            });
          }}
          size="icon-sm"
        >
          <GearSixIcon />
        </Button>
        {adminButton}
        <Separator className="annotation:bg-primary-foreground/25" orientation="vertical" />
        <Button onClick={closeAnnotationDock} size="icon-sm">
          <XIcon />
        </Button>
      </motion.div>
    );
  };

  return (
    <div className={positionConfig.rootClassName} data-annotation-overlay-root="true">
      <AnimatePresence
        anchorX={positionConfig.anchorX}
        anchorY={positionConfig.anchorY}
        mode="popLayout"
      >
        {isPanelOpen ? (
          <motion.div
            animate="animate"
            exit="exit"
            initial="initial"
            key="annotations"
            variants={variantsCard}
          >
            <Card className="annotation:w-64 annotation:pb-0">
              <CardHeader>
                <FieldGroup>
                  <Field orientation="horizontal">
                    <FieldLabel htmlFor="annotation-panel-for-you">
                      For you · {unreadCount}
                    </FieldLabel>
                    <Switch
                      checked={showForYou}
                      id="annotation-panel-for-you"
                      onCheckedChange={setShowForYou}
                    />
                  </Field>
                  {showForYou ? (
                    <Button
                      disabled={unreadCount === 0}
                      onClick={() => void markAllRead()}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Mark all as read
                    </Button>
                  ) : (
                    <>
                      <Field orientation="horizontal">
                        <FieldLabel htmlFor="annotation-panel-show-resolved">
                          Resolved comments
                        </FieldLabel>
                        <Switch
                          checked={showResolved}
                          id="annotation-panel-show-resolved"
                          onCheckedChange={setShowResolved}
                        />
                      </Field>
                      <Field orientation="horizontal">
                        <FieldLabel htmlFor="annotation-panel-show-all">All pages</FieldLabel>
                        <Switch
                          checked={showAllPages}
                          id="annotation-panel-show-all"
                          onCheckedChange={(checked) => {
                            writeStoredBoolean(onlyCurrentPageKey, !checked);
                            setShowOnlyCurrentPage(!checked);
                          }}
                        />
                      </Field>
                    </>
                  )}
                </FieldGroup>
              </CardHeader>
              <CardContent className="annotation:flex annotation:flex-col annotation:gap-0 annotation:border-t annotation:p-0">
                <div className="annotation:grid annotation:h-[min(24rem,calc(100vh-8rem))] annotation:gap-0 annotation:bg-muted">
                  <ScrollArea
                    className="annotation:h-full annotation:max-h-[min(24rem,calc(100vh-8rem))]"
                    type="scroll"
                  >
                    <div className="annotation:flex annotation:flex-col annotation:gap-2 annotation:p-2">
                      {isLoading ? (
                        <p className="annotation:p-2 annotation:text-center annotation:text-sm annotation:text-muted-foreground">
                          Loading annotations…
                        </p>
                      ) : null}
                      {!isLoading &&
                      (showForYou ? forYou.length === 0 : visibleThreads.length === 0) ? (
                        <p className="annotation:p-2 annotation:text-center annotation:text-sm annotation:text-muted-foreground">
                          No annotations
                        </p>
                      ) : null}
                      {!isLoading && showForYou
                        ? forYou.map((entry) => <ForYouCard entry={entry} key={entry.comment_id} />)
                        : null}
                      {!isLoading && !showForYou
                        ? visibleThreads.map((comment) => (
                            <ThreadCard
                              activeThreadId={activeThreadId}
                              comment={comment}
                              comments={comments}
                              currentPath={currentPath}
                              key={comment.id}
                            />
                          ))
                        : null}
                    </div>
                  </ScrollArea>
                  {errorMessage ? (
                    <div className="annotation:border-t annotation:border-border/60 annotation:px-4 annotation:py-3">
                      <div className="annotation:rounded-xl annotation:border annotation:border-destructive/30 annotation:bg-destructive/10 annotation:px-3 annotation:py-2 annotation:text-sm annotation:text-destructive">
                        {errorMessage}
                      </div>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ) : null}

        {isSettingsOpen ? (
          <motion.div
            animate="animate"
            exit="exit"
            initial="initial"
            key="settings"
            variants={variantsCard}
          >
            <Card className="annotation:w-64">
              <CardHeader>
                <CardTitle className="annotation:flex annotation:items-baseline annotation:justify-between annotation:gap-2">
                  <img alt="Annotation" className="annotation:h-3 annotation:w-fit" src={logo} />
                  <span className="annotation:text-xs annotation:text-muted-foreground">v0.1</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="annotation-panel-name">Name</FieldLabel>
                    <form
                      className="annotation:flex annotation:gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (canSaveName) {
                          void renameSelf(trimmedNameDraft);
                        }
                      }}
                    >
                      {/* Staff carry the name from the list; only guests may rename themselves. */}
                      <Input
                        disabled={!isGuest}
                        id="annotation-panel-name"
                        maxLength={48}
                        minLength={2}
                        onChange={(event) => setNameDraft(event.target.value)}
                        value={nameDraft}
                      />
                      {isGuest ? (
                        <Button disabled={!canSaveName} size="sm" type="submit">
                          Save
                        </Button>
                      ) : null}
                    </form>
                  </Field>
                  <Field>
                    <FieldLabel>Position</FieldLabel>
                    <div className="annotation:grid annotation:grid-cols-2 annotation:gap-2">
                      {POSITION_OPTIONS.map((option) => (
                        <Button
                          key={option.value}
                          onClick={() => {
                            writeStoredString(positionKey, option.value);
                            setPosition(option.value);
                          }}
                          size="xs"
                          type="button"
                          variant={position === option.value ? "secondary" : "outline"}
                        >
                          {option.icon}
                        </Button>
                      ))}
                    </div>
                  </Field>
                  <Field>
                    <div className="annotation:flex annotation:items-center annotation:justify-between annotation:gap-2">
                      <FieldLabel>Resolve all</FieldLabel>
                      <Badge variant="secondary">{unresolvedThreadCount}</Badge>
                    </div>
                    <ResolveAllSlider onResolveAll={resolveAllComments} />
                  </Field>
                </FieldGroup>
                {errorMessage ? (
                  <div className="annotation:mt-4 annotation:rounded-xl annotation:border annotation:border-destructive/30 annotation:bg-destructive/10 annotation:px-3 annotation:py-2 annotation:text-sm annotation:text-destructive">
                    {errorMessage}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </motion.div>
        ) : null}

        {isAdminOpen && isAdmin ? (
          <motion.div
            animate="animate"
            exit="exit"
            initial="initial"
            key="admin"
            variants={variantsCard}
          >
            <AdminCard />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.div
        animate={{ height, width }}
        className="annotation:overflow-hidden annotation:rounded-md annotation:bg-primary"
        transition={{ duration: 0.25, ease: [0.17, 0.84, 0.44, 1] }}
      >
        <div
          className="annotation:relative annotation:h-fit annotation:w-fit annotation:overflow-hidden"
          ref={refContainer}
        >
          <AnimatePresence mode="popLayout">{renderDock()}</AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
