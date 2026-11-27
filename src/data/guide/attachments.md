## Choosing Between `Brief` and `+` Attachments

- **Scene Brief (`Brief` button below composer)**: Best for persistent anchors carried across turns—cast/location lookbook references (`@image1`, `@video1`), **Format & Specs**, and **Subtext**. Brief fields stay active across turns (and can be paused via *Include in AI context*).
- **Composer `+` Menu (per-turn)**: Best for one-turn source material (reference videos, beat sheets, screenplays, or comparison renders) without cluttering `Scene Brief` or affecting **Quick Scan**.

---

## `+` Attachment Sources

Click **`+`** (or drag-and-drop / paste images directly into the prompt box):

- **Upload file(s)…**:
  - **Images & plain text (`<= 256 KB`)**: Compressed/read locally and sent inline for that turn.
  - **Video, audio, PDF, & `> 256 KB` text**: Uploaded automatically to Gemini Files API with live chip progress and cancel support.
- **Gemini Cloud Files (48h)…**: Browse active cloud uploads stored on your API key, monitor remaining 48-hour lifetime (`Xh Ym left`), delete stale files, or re-attach an existing upload into a new chat without re-uploading.
- **YouTube URL…**: Attach a public YouTube link directly to the turn.
- **Paste Text Section…**: Paste a full screenplay, outline, dialogue sheet, or notes into a clean modal editor wrapped in `<tag>...</tag>` (for example `<screenplay>`). Click any staged `SECTION` chip to edit before sending; full sections persist in History up to `256 KB`.

> Video chips (YouTube or Files API) include a **Static / Agentic** toggle: **Static** samples 1 fps steadily; **Agentic** uses adaptive temporal inspection for dense or fast-cut clips.
