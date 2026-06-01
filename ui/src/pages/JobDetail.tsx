// /jobs/:id — single-job detail view. Wraps the existing JobProgress
// component (which already handles SSE + Stop + log + error summary)
// so the URL is shareable / reachable from the recent-jobs list +
// header chip.

import { Link, useParams } from "react-router-dom";
import JobProgress from "../components/JobProgress.tsx";

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  return (
    <div>
      <div className="mb-6">
        <Link
          to="/jobs"
          className="text-xs text-stone-500 hover:text-stone-900 underline-offset-2 hover:underline"
        >
          ← Back to Jobs
        </Link>
      </div>
      <h1 className="t-display mb-6">Job detail</h1>
      {id ? (
        <JobProgress jobId={id} />
      ) : (
        <div className="text-sm text-stone-500">Missing job id.</div>
      )}
    </div>
  );
}
