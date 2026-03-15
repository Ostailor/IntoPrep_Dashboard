export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Table<Row, Insert = Row, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<
        {
          id: string;
          full_name: string | null;
          email: string | null;
          role: "engineer" | "admin" | "staff" | "ta" | "instructor";
          title: string | null;
          account_status: "active" | "suspended";
          must_change_password: boolean;
          session_revoked_at: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id: string;
          full_name?: string | null;
          email?: string | null;
          role?: "engineer" | "admin" | "staff" | "ta" | "instructor";
          title?: string | null;
          account_status?: "active" | "suspended";
          must_change_password?: boolean;
          session_revoked_at?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      user_templates: Table<
        {
          email: string;
          full_name: string;
          role: "engineer" | "admin" | "staff" | "ta" | "instructor";
          title: string;
          assigned_cohort_ids: string[];
          account_status: "active" | "suspended";
          must_change_password: boolean;
          deleted_at: string | null;
          deleted_by: string | null;
        },
        {
          email: string;
          full_name: string;
          role: "engineer" | "admin" | "staff" | "ta" | "instructor";
          title: string;
          assigned_cohort_ids: string[];
          account_status: "active" | "suspended";
          must_change_password: boolean;
          deleted_at?: string | null;
          deleted_by?: string | null;
        }
      >;
      account_audit_logs: Table<
        {
          id: string;
          actor_id: string | null;
          target_user_id: string | null;
          target_email: string | null;
          target_type: string | null;
          issue_reference: string | null;
          action: string;
          summary: string;
          details: Json;
          created_at: string;
        },
        {
          id?: string;
          actor_id?: string | null;
          target_user_id?: string | null;
          target_email?: string | null;
          target_type?: string | null;
          issue_reference?: string | null;
          action: string;
          summary: string;
          details?: Json;
          created_at?: string;
        }
      >;
      cohort_assignments: Table<
        {
          id: string;
          cohort_id: string;
          user_id: string;
          role: "engineer" | "admin" | "staff" | "ta" | "instructor";
          created_at: string;
        },
        {
          id?: string;
          cohort_id: string;
          user_id: string;
          role: "engineer" | "admin" | "staff" | "ta" | "instructor";
          created_at?: string;
        }
      >;
      campuses: Table<{
        id: string;
        name: string;
        location: string;
        modality: string;
      }>;
      programs: Table<{
        id: string;
        name: string;
        track: string;
        format: string;
        tuition: number;
      }>;
      terms: Table<
        {
          id: string;
          name: string;
          start_date: string;
          end_date: string;
        },
        {
          id: string;
          name: string;
          start_date: string;
          end_date: string;
        }
      >;
      families: Table<{
        id: string;
        family_name: string;
        guardian_names: string[];
        email: string;
        phone: string;
        preferred_campus_id: string;
        notes: string;
      }>;
      students: Table<{
        id: string;
        family_id: string;
        first_name: string;
        last_name: string;
        grade_level: string;
        school: string;
        target_test: string;
        focus: string;
      }>;
      cohorts: Table<
        {
          id: string;
          name: string;
          program_id: string;
          campus_id: string;
          term_id: string;
          capacity: number;
          enrolled: number;
          lead_instructor_id: string | null;
          cadence: string;
          room_label: string;
        },
        {
          id: string;
          name: string;
          program_id: string;
          campus_id: string;
          term_id: string;
          capacity: number;
          enrolled?: number;
          lead_instructor_id?: string | null;
          cadence: string;
          room_label: string;
        }
      >;
      enrollments: Table<
        {
          id: string;
          student_id: string;
          cohort_id: string;
          status: string;
          registered_at: string;
        },
        {
          id: string;
          student_id: string;
          cohort_id: string;
          status: string;
          registered_at: string;
        }
      >;
      sessions: Table<
        {
          id: string;
          cohort_id: string;
          title: string;
          start_at: string;
          end_at: string;
          mode: string;
          room_label: string;
        },
        {
          id: string;
          cohort_id: string;
          title: string;
          start_at: string;
          end_at: string;
          mode: string;
          room_label: string;
        }
      >;
      attendance_records: Table<
        {
          id: string;
          session_id: string;
          student_id: string;
          status: "present" | "absent" | "tardy";
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          session_id: string;
          student_id: string;
          status: "present" | "absent" | "tardy";
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      assessments: Table<
        {
          id: string;
          cohort_id: string;
          title: string;
          date: string;
          sections: Json;
        },
        {
          id: string;
          cohort_id: string;
          title: string;
          date: string;
          sections: Json;
        }
      >;
      assessment_results: Table<
        {
          id: string;
          assessment_id: string;
          student_id: string;
          total_score: number;
          section_scores: Json;
          delta_from_previous: number;
        },
        {
          id: string;
          assessment_id: string;
          student_id: string;
          total_score: number;
          section_scores: Json;
          delta_from_previous: number;
        }
      >;
      academic_notes: Table<
        {
          id: string;
          student_id: string;
          author_id: string | null;
          visibility: string;
          summary: string;
          created_at: string;
        },
        {
          id: string;
          student_id: string;
          author_id?: string | null;
          visibility?: string;
          summary: string;
          created_at?: string;
        }
      >;
      resources: Table<
        {
          id: string;
          cohort_id: string;
          title: string;
          kind: string;
          published_at: string;
          link_url: string | null;
          file_name: string | null;
          storage_path: string | null;
        },
        {
          id: string;
          cohort_id: string;
          title: string;
          kind: string;
          published_at?: string;
          link_url?: string | null;
          file_name?: string | null;
          storage_path?: string | null;
        }
      >;
      invoices: Table<
        {
          id: string;
          family_id: string;
          amount_due: number;
          due_date: string;
          status: string;
          source: string;
        },
        {
          id: string;
          family_id: string;
          amount_due: number;
          due_date: string;
          status: string;
          source: string;
        }
      >;
      message_threads: Table<
        {
          id: string;
          cohort_id: string;
          subject: string;
          participants: string[];
          last_message_preview: string;
          last_message_at: string;
          unread_count: number;
        },
        {
          id: string;
          cohort_id: string;
          subject: string;
          participants?: string[];
          last_message_preview: string;
          last_message_at?: string;
          unread_count?: number;
        }
      >;
      message_posts: Table<
        {
          id: string;
          thread_id: string;
          author_id: string | null;
          body: string;
          created_at: string;
        },
        {
          id?: string;
          thread_id: string;
          author_id?: string | null;
          body: string;
          created_at?: string;
        }
      >;
      leads: Table<
        {
          id: string;
          student_name: string;
          guardian_name: string;
          target_program: string;
          stage: string;
          submitted_at: string;
        },
        {
          id: string;
          student_name: string;
          guardian_name: string;
          target_program: string;
          stage: string;
          submitted_at?: string;
        }
      >;
      sync_jobs: Table<
        {
          id: string;
          label: string;
          cadence: string;
          status: string;
          last_run_at: string;
          summary: string;
          owner_id: string | null;
          acknowledged_by: string | null;
          acknowledged_at: string | null;
          muted_until: string | null;
          handoff_notes: string | null;
          runbook_url: string | null;
        },
        {
          id: string;
          label: string;
          cadence: string;
          status: string;
          last_run_at?: string;
          summary: string;
          owner_id?: string | null;
          acknowledged_by?: string | null;
          acknowledged_at?: string | null;
          muted_until?: string | null;
          handoff_notes?: string | null;
          runbook_url?: string | null;
        }
      >;
      billing_sync_sources: Table<
        {
          id: string;
          label: string;
          source_type: string;
          source_url: string;
          cadence: string;
          is_active: boolean;
          last_synced_at: string | null;
          last_sync_status: string | null;
          last_sync_summary: string | null;
          created_by: string | null;
          updated_by: string | null;
          control_state: string;
          owner_id: string | null;
          handoff_notes: string | null;
          changed_by: string | null;
          changed_at: string;
          runbook_url: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id: string;
          label: string;
          source_type?: string;
          source_url: string;
          cadence?: string;
          is_active?: boolean;
          last_synced_at?: string | null;
          last_sync_status?: string | null;
          last_sync_summary?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          control_state?: string;
          owner_id?: string | null;
          handoff_notes?: string | null;
          changed_by?: string | null;
          changed_at?: string;
          runbook_url?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      intake_sync_sources: Table<
        {
          id: string;
          label: string;
          source_type: string;
          source_url: string;
          cadence: string;
          is_active: boolean;
          last_synced_at: string | null;
          last_sync_status: string | null;
          last_sync_summary: string | null;
          created_by: string | null;
          updated_by: string | null;
          control_state: string;
          owner_id: string | null;
          handoff_notes: string | null;
          changed_by: string | null;
          changed_at: string;
          runbook_url: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id: string;
          label: string;
          source_type?: string;
          source_url: string;
          cadence?: string;
          is_active?: boolean;
          last_synced_at?: string | null;
          last_sync_status?: string | null;
          last_sync_summary?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          control_state?: string;
          owner_id?: string | null;
          handoff_notes?: string | null;
          changed_by?: string | null;
          changed_at?: string;
          runbook_url?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      sync_job_runs: Table<
        {
          id: string;
          job_id: string;
          run_key: string | null;
          initiated_by: string;
          status: string;
          summary: string;
          metadata: Json;
          notification_sent: boolean;
          started_at: string;
          finished_at: string | null;
        },
        {
          id: string;
          job_id: string;
          run_key?: string | null;
          initiated_by: string;
          status: string;
          summary: string;
          metadata?: Json;
          notification_sent?: boolean;
          started_at?: string;
          finished_at?: string | null;
        }
      >;
      intake_import_runs: Table<
        {
          id: string;
          source: string;
          filename: string;
          status: string;
          started_at: string;
          finished_at: string;
          imported_count: number;
          lead_count: number;
          family_count: number;
          student_count: number;
          enrollment_count: number;
          error_count: number;
          summary: string;
          error_samples: Json;
          created_by: string | null;
        },
        {
          id: string;
          source: string;
          filename: string;
          status: string;
          started_at?: string;
          finished_at?: string;
          imported_count?: number;
          lead_count?: number;
          family_count?: number;
          student_count?: number;
          enrollment_count?: number;
          error_count?: number;
          summary: string;
          error_samples?: Json;
          created_by?: string | null;
        }
      >;
      sensitive_access_grants: Table<
        {
          id: string;
          scope_type: string;
          scope_id: string;
          reason: string;
          issue_reference: string;
          granted_by: string;
          revoked_by: string | null;
          created_at: string;
          expires_at: string;
          revoked_at: string | null;
        },
        {
          id: string;
          scope_type: string;
          scope_id: string;
          reason: string;
          issue_reference: string;
          granted_by: string;
          revoked_by?: string | null;
          created_at?: string;
          expires_at: string;
          revoked_at?: string | null;
        }
      >;
      engineer_support_notes: Table<
        {
          id: string;
          target_type: string;
          target_id: string;
          issue_reference: string;
          body: string;
          author_id: string;
          created_at: string;
        },
        {
          id: string;
          target_type: string;
          target_id: string;
          issue_reference: string;
          body: string;
          author_id: string;
          created_at?: string;
        }
      >;
      feature_flags: Table<
        {
          key: string;
          description: string;
          enabled_roles: ("engineer" | "admin" | "staff" | "ta" | "instructor")[];
          updated_by: string | null;
          updated_at: string;
        },
        {
          key: string;
          description: string;
          enabled_roles?: ("engineer" | "admin" | "staff" | "ta" | "instructor")[];
          updated_by?: string | null;
          updated_at?: string;
        }
      >;
      portal_change_freezes: Table<
        {
          id: string;
          enabled: boolean;
          scope: string;
          reason: string | null;
          issue_reference: string | null;
          set_by: string | null;
          created_at: string;
          updated_at: string;
          expires_at: string | null;
        },
        {
          id: string;
          enabled?: boolean;
          scope?: string;
          reason?: string | null;
          issue_reference?: string | null;
          set_by?: string | null;
          created_at?: string;
          updated_at?: string;
          expires_at?: string | null;
        }
      >;
      portal_maintenance_banners: Table<
        {
          id: string;
          message: string;
          tone: string;
          issue_reference: string | null;
          owner_id: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
          starts_at: string;
          expires_at: string | null;
        },
        {
          id: string;
          message: string;
          tone?: string;
          issue_reference?: string | null;
          owner_id?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          starts_at?: string;
          expires_at?: string | null;
        }
      >;
      portal_release_metadata: Table<
        {
          id: string;
          app_version: string;
          schema_version: string;
          updated_at: string;
        },
        {
          id: string;
          app_version: string;
          schema_version: string;
          updated_at?: string;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
