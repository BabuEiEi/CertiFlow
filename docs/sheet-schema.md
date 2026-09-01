# Google Sheets Database Schema

Spreadsheet database schema specification for **CertiFlow**.

## Sheets Overview

1. `Settings` (`key`, `value`, `description`, `updatedAt`, `updatedBy`)
2. `Activities` (`activityId`, `sequence`, `activityName`, `organizer`, `issueAgency`, `startDate`, `endDate`, `issueDate`, `prefixText`, `prefix`, `startNumber`, `endNumber`, `digitLength`, `separator`, `year`, `numberFormat`, `templateId`, `status`, `createdBy`, `createdAt`, `updatedBy`, `updatedAt`)
3. `Users` (`userId`, `email`, `name`, `role`, `status`, `passwordSalt`, `passwordHash`, `createdAt`, `updatedAt`, `lastLogin`)
4. `Participants` (`participantId`, `activityId`, `prefixName`, `firstName`, `lastName`, `school`, `participantStatus`, `importBatchId`, `sourceRow`, `createdAt`, `createdBy`, `updatedAt`, `updatedBy`)
5. `Certificates` (`certificateId`, `activityId`, `participantId`, `certificateNo`, `runningNumber`, `prefixName`, `firstName`, `lastName`, `school`, `participantStatus`, `certificateStatus`, `originalPrefixName`, `originalFirstName`, `originalLastName`, `issuedAt`, `issuedBy`, `revokedAt`, `revokedBy`, `revokeReason`, `createdAt`, `createdBy`, `updatedAt`, `updatedBy`)
6. `GenerationQueue` (`queueId`, `activityId`, `jobType`, `startRow`, `endRow`, `currentRow`, `totalCount`, `successCount`, `failCount`, `status`, `retryCount`, `lastError`, `createdAt`, `updatedAt`)
7. `AuditLogs` (`logId`, `action`, `entityType`, `entityId`, `actorEmail`, `actorRole`, `beforeJson`, `afterJson`, `note`, `createdAt`)
