import { CloudSchedulerClient } from "@google-cloud/scheduler";

const PROJECT_ID = "barbu-sportif-ai-center";
const LOCATION = "us-central1"; 
const scheduler = new CloudSchedulerClient();

export async function createScheduledTask(
  taskId: string,
  cronExpression: string,
  taskPayload: any,
  userDescription: string
) {
  const parent = scheduler.locationPath(PROJECT_ID, LOCATION);
  const name = `projects/${PROJECT_ID}/locations/${LOCATION}/jobs/rick-auto-${taskId}`;
  const url = `https://barbusportif-ai-497745856294.us-central1.run.app/api/tasks/execute`;
  
  // CRON_SECRET for security
  const cronSecret = process.env.CRON_SECRET || "fallback_secret";

  const job = {
    name: name,
    description: userDescription,
    schedule: cronExpression,
    timeZone: "America/Toronto", // Mirabel time
    httpTarget: {
      uri: url,
      httpMethod: "POST" as const,
      headers: {
        "Content-Type": "application/json",
        "X-Cron-Secret": cronSecret,
      },
      body: Buffer.from(JSON.stringify(taskPayload)),
    },
  };

  try {
    // Delete if exists to update
    try {
      await scheduler.deleteJob({ name });
    } catch (e) {
      // Ignore if not found
    }

    const [response] = await scheduler.createJob({
      parent: parent,
      job: job,
    });

    console.log(`[Scheduler] Tarea programada con éxito: ${response.name}`);
    return response;
  } catch (error: any) {
    console.error("[Scheduler] Error creando tarea:", error.message);
    throw error;
  }
}
