const nodemailer = require('nodemailer');

let cachedTransporter = null;

function getMailerConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;

  if (!host || !user || !pass || !from) {
    throw new Error('SMTP configuration is incomplete. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM.');
  }

  return { host, port, user, pass, from };
}

function getTransporter() {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const config = getMailerConfig();
  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: false,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    tls: {
      ciphers: 'SSLv3',
    },
  });

  return cachedTransporter;
}

async function sendSupplierInviteEmail({ to, supplierName, temporaryPassword }) {
  const transporter = getTransporter();
  const { from } = getMailerConfig();
  const portalUrl = process.env.SUPPLIER_PORTAL_URL || 'http://localhost:3000/login';

  await transporter.sendMail({
    from,
    to,
    subject: 'Royal Horizon Supplier Portal Invitation',
    text: [
      `Hello ${supplierName},`,
      '',
      'Your supplier portal account has been created by Royal Horizon.',
      `Login URL: ${portalUrl}`,
      `Email: ${to}`,
      `Temporary Password: ${temporaryPassword}`,
      '',
      'Please sign in, complete your supplier profile, and wait for admin activation once your profile reaches 100% completion.',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
        <p>Hello ${supplierName},</p>
        <p>Your supplier portal account has been created by Royal Horizon.</p>
        <p><strong>Login URL:</strong> <a href="${portalUrl}">${portalUrl}</a></p>
        <p><strong>Email:</strong> ${to}<br/><strong>Temporary Password:</strong> ${temporaryPassword}</p>
        <p>Please sign in, complete your supplier profile, and wait for admin activation once your profile reaches 100% completion.</p>
      </div>
    `,
  });
}

async function sendInternalUserInviteEmail({ to, userName, role, temporaryPassword }) {
  const transporter = getTransporter();
  const { from } = getMailerConfig();
  const portalUrl = process.env.INTERNAL_PORTAL_URL || 'http://localhost:4200/auth/login';

  await transporter.sendMail({
    from,
    to,
    subject: 'Royal Horizon Shipment Portal Access',
    text: [
      `Hello ${userName},`,
      '',
      'Your internal user account has been created for the Royal Horizon shipment portal.',
      `Login URL: ${portalUrl}`,
      `Email: ${to}`,
      `Role: ${role}`,
      `Temporary Password: ${temporaryPassword}`,
      '',
      'You will be required to change this password when you sign in for the first time.',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
        <p>Hello ${userName},</p>
        <p>Your internal user account has been created for the Royal Horizon shipment portal.</p>
        <p><strong>Login URL:</strong> <a href="${portalUrl}">${portalUrl}</a></p>
        <p><strong>Email:</strong> ${to}<br/><strong>Role:</strong> ${role}<br/><strong>Temporary Password:</strong> ${temporaryPassword}</p>
        <p>You will be required to change this password when you sign in for the first time.</p>
      </div>
    `,
  });
}

async function sendInternalUserPasswordResetEmail({ to, userName, role, temporaryPassword }) {
  const transporter = getTransporter();
  const { from } = getMailerConfig();
  const portalUrl = process.env.INTERNAL_PORTAL_URL || 'http://localhost:4200/auth/login';

  await transporter.sendMail({
    from,
    to,
    subject: 'Royal Horizon Shipment Portal Password Reset',
    text: [
      `Hello ${userName},`,
      '',
      'Your password has been reset for the Royal Horizon shipment portal.',
      `Login URL: ${portalUrl}`,
      `Email: ${to}`,
      `Role: ${role}`,
      `Temporary Password: ${temporaryPassword}`,
      '',
      'You will be required to change this password when you sign in for the first time.',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
        <p>Hello ${userName},</p>
        <p>Your password has been reset for the Royal Horizon shipment portal.</p>
        <p><strong>Login URL:</strong> <a href="${portalUrl}">${portalUrl}</a></p>
        <p><strong>Email:</strong> ${to}<br/><strong>Role:</strong> ${role}<br/><strong>Temporary Password:</strong> ${temporaryPassword}</p>
        <p>You will be required to change this password when you sign in for the first time.</p>
      </div>
    `,
  });
}

async function sendWorkflowUpdateEmail({
  to,
  userName,
  shipmentNo,
  containerSerialNo,
  sectionLabel,
  updatedBy,
  nextRole,
  approvalStage,
}) {
  const transporter = getTransporter();
  const { from } = getMailerConfig();
  const portalUrl = process.env.INTERNAL_PORTAL_URL || 'http://localhost:4200/auth/login';
  const safeUserName = userName || 'Team member';
  const safeShipmentNo = shipmentNo || 'N/A';
  const safeContainerSerialNo = containerSerialNo || 'N/A';
  const safeSectionLabel = sectionLabel || 'Shipment section';
  const safeUpdatedBy = updatedBy || 'A user';
  const safeNextRole = nextRole || 'Assigned team';
  const safeApprovalStage = approvalStage || '';

  await transporter.sendMail({
    from,
    to,
    subject: `Royal Horizon Shipment Update: ${safeSectionLabel}`,
    text: [
      `Hello ${safeUserName},`,
      '',
      `${safeUpdatedBy} saved the ${safeSectionLabel} section in the shipment workflow.`,
      `Shipment No: ${safeShipmentNo}`,
      `Container Serial No: ${safeContainerSerialNo}`,
      `Responsible Team: ${safeNextRole}`,
      ...(safeApprovalStage ? [`Approval Stage: ${safeApprovalStage}`] : []),
      '',
      `You can review the latest update here: ${portalUrl}`,
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
        <p>Hello ${safeUserName},</p>
        <p><strong>${safeUpdatedBy}</strong> saved the <strong>${safeSectionLabel}</strong> section in the shipment workflow.</p>
        <p>
          <strong>Shipment No:</strong> ${safeShipmentNo}<br/>
          <strong>Container Serial No:</strong> ${safeContainerSerialNo}<br/>
          <strong>Responsible Team:</strong> ${safeNextRole}
          ${safeApprovalStage ? `<br/><strong>Approval Stage:</strong> ${safeApprovalStage}` : ''}
        </p>
        <p>You can review the latest update here: <a href="${portalUrl}">${portalUrl}</a></p>
      </div>
    `,
  });
}

async function sendShipmentScheduledEmail({
  to,
  userName,
  shipmentId,
  shipmentUrl,
  scheduleLines = [],
  scheduledByLabel,
}) {
  const transporter = getTransporter();
  const { from } = getMailerConfig();
  const safeUserName = userName || 'Team';
  const safeShipmentId = shipmentId || 'N/A';
  const safeScheduledByLabel = scheduledByLabel || 'the Purchase Department';
  const safeShipmentUrl = shipmentUrl || '';
  const normalizedScheduleLines = Array.isArray(scheduleLines)
    ? scheduleLines.filter((line) => String(line || '').trim().length > 0)
    : [];

  const bodyLine = `The above shipment has been scheduled by ${safeScheduledByLabel}. Please take note and proceed with the necessary action for this shipment schedule.`;
  const textScheduleBlock = normalizedScheduleLines.length
    ? ['', 'ETA / ETD Updates:', ...normalizedScheduleLines]
    : [];
  const htmlScheduleBlock = normalizedScheduleLines.length
    ? `
        <p><strong>ETA / ETD Updates:</strong></p>
        <ul style="margin: 0 0 16px 18px; padding: 0;">
          ${normalizedScheduleLines.map((line) => `<li>${line}</li>`).join('')}
        </ul>
      `
    : '';

  await transporter.sendMail({
    from,
    to,
    subject: 'Shipment Scheduled Notification',
    text: [
      `Dear ${safeUserName},`,
      '',
      `Shipment ID: ${safeShipmentId}`,
      '',
      bodyLine,
      ...textScheduleBlock,
      ...(safeShipmentUrl ? ['', `Open in Portal: ${safeShipmentUrl}`] : []),
      '',
      'Regards,',
      'Royal Horizon',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
        <p>Dear ${safeUserName},</p>
        <p><strong>Shipment ID:</strong> ${safeShipmentId}</p>
        <p>${bodyLine}</p>
        ${htmlScheduleBlock}
        ${safeShipmentUrl ? `<p><strong>Open in Portal:</strong> <a href="${safeShipmentUrl}">${safeShipmentUrl}</a></p>` : ''}
        <p>Regards,<br/>Royal Horizon</p>
      </div>
    `,
  });
}

async function sendActualContainerSavedEmail({
  to,
  userName,
  shipmentId,
  scheduleSerialNo,
  actualSerialNo,
  actualDetails = [],
  shipmentUrl,
  updatedBy,
}) {
  const transporter = getTransporter();
  const { from } = getMailerConfig();
  const safeUserName = userName || 'Team';
  const safeShipmentId = shipmentId || 'N/A';
  const safeScheduleSerialNo = scheduleSerialNo || 'N/A';
  const safeActualSerialNo = actualSerialNo || 'N/A';
  const safeShipmentUrl = shipmentUrl || '';
  const safeUpdatedBy = updatedBy || 'A user';
  const normalizedDetails = Array.isArray(actualDetails)
    ? actualDetails.filter((line) => String(line || '').trim().length > 0)
    : [];

  await transporter.sendMail({
    from,
    to,
    subject: 'Actual Shipment Update Notification',
    text: [
      `Dear ${safeUserName},`,
      '',
      `${safeUpdatedBy} saved an Actual shipment record.`,
      `Shipment ID: ${safeShipmentId}`,
      `Schedule Serial No: ${safeScheduleSerialNo}`,
      `Actual Serial No: ${safeActualSerialNo}`,
      ...(normalizedDetails.length ? ['', 'Saved Actual Details:', ...normalizedDetails] : []),
      ...(safeShipmentUrl ? ['', `Open in Portal: ${safeShipmentUrl}`] : []),
      '',
      'Regards,',
      'Royal Horizon',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
        <p>Dear ${safeUserName},</p>
        <p><strong>${safeUpdatedBy}</strong> saved an <strong>Actual shipment</strong> record.</p>
        <p>
          <strong>Shipment ID:</strong> ${safeShipmentId}<br/>
          <strong>Schedule Serial No:</strong> ${safeScheduleSerialNo}<br/>
          <strong>Actual Serial No:</strong> ${safeActualSerialNo}
        </p>
        ${
          normalizedDetails.length
            ? `
              <p><strong>Saved Actual Details:</strong></p>
              <ul style="margin: 0 0 16px 18px; padding: 0;">
                ${normalizedDetails.map((line) => `<li>${line}</li>`).join('')}
              </ul>
            `
            : ''
        }
        ${safeShipmentUrl ? `<p><strong>Open in Portal:</strong> <a href="${safeShipmentUrl}">${safeShipmentUrl}</a></p>` : ''}
        <p>Regards,<br/>Royal Horizon</p>
      </div>
    `,
  });
}

async function sendClearingAdvanceStatusEmail({
  to,
  userName,
  shipmentId,
  containerSerialNo,
  approvalStage,
  updatedBy,
  detailLines = [],
  shipmentUrl,
}) {
  const transporter = getTransporter();
  const { from } = getMailerConfig();
  const safeUserName = userName || 'Team';
  const safeShipmentId = shipmentId || 'N/A';
  const safeContainerSerialNo = containerSerialNo || 'N/A';
  const safeApprovalStage = approvalStage || 'Clearing Advance Updated';
  const safeUpdatedBy = updatedBy || 'A user';
  const safeShipmentUrl = shipmentUrl || '';
  const normalizedDetails = Array.isArray(detailLines)
    ? detailLines.filter((line) => String(line || '').trim().length > 0)
    : [];

  await transporter.sendMail({
    from,
    to,
    subject: `Clearing Advance Notification: ${safeApprovalStage}`,
    text: [
      `Dear ${safeUserName},`,
      '',
      `${safeUpdatedBy} updated the Clearing Advance workflow.`,
      `Shipment ID: ${safeShipmentId}`,
      `Container Serial No: ${safeContainerSerialNo}`,
      `Approval Stage: ${safeApprovalStage}`,
      ...(normalizedDetails.length ? ['', ...normalizedDetails] : []),
      ...(safeShipmentUrl ? ['', `Open in Portal: ${safeShipmentUrl}`] : []),
      '',
      'Regards,',
      'Royal Horizon',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
        <p>Dear ${safeUserName},</p>
        <p><strong>${safeUpdatedBy}</strong> updated the <strong>Clearing Advance</strong> workflow.</p>
        <p>
          <strong>Shipment ID:</strong> ${safeShipmentId}<br/>
          <strong>Container Serial No:</strong> ${safeContainerSerialNo}<br/>
          <strong>Approval Stage:</strong> ${safeApprovalStage}
        </p>
        ${
          normalizedDetails.length
            ? `
              <ul style="margin: 0 0 16px 18px; padding: 0;">
                ${normalizedDetails.map((line) => `<li>${line}</li>`).join('')}
              </ul>
            `
            : ''
        }
        ${safeShipmentUrl ? `<p><strong>Open in Portal:</strong> <a href="${safeShipmentUrl}">${safeShipmentUrl}</a></p>` : ''}
        <p>Regards,<br/>Royal Horizon</p>
      </div>
    `,
  });
}

async function sendPaymentAllocationStatusEmail({
  to,
  userName,
  shipmentId,
  containerSerialNo,
  updatedBy,
  detailLines = [],
  shipmentUrl,
}) {
  const transporter = getTransporter();
  const { from } = getMailerConfig();
  const safeUserName = userName || 'Team';
  const safeShipmentId = shipmentId || 'N/A';
  const safeContainerSerialNo = containerSerialNo || 'N/A';
  const safeUpdatedBy = updatedBy || 'A user';
  const safeShipmentUrl = shipmentUrl || '';
  const normalizedDetails = Array.isArray(detailLines)
    ? detailLines.filter((line) => String(line || '').trim().length > 0)
    : [];

  await transporter.sendMail({
    from,
    to,
    subject: 'Payment Allocation Saved Notification',
    text: [
      `Dear ${safeUserName},`,
      '',
      `${safeUpdatedBy} saved the Payment Allocation section.`,
      `Shipment ID: ${safeShipmentId}`,
      `Container Serial No: ${safeContainerSerialNo}`,
      ...(normalizedDetails.length ? ['', ...normalizedDetails] : []),
      ...(safeShipmentUrl ? ['', `Open in Portal: ${safeShipmentUrl}`] : []),
      '',
      'Regards,',
      'Royal Horizon',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
        <p>Dear ${safeUserName},</p>
        <p><strong>${safeUpdatedBy}</strong> saved the <strong>Payment Allocation</strong> section.</p>
        <p>
          <strong>Shipment ID:</strong> ${safeShipmentId}<br/>
          <strong>Container Serial No:</strong> ${safeContainerSerialNo}
        </p>
        ${
          normalizedDetails.length
            ? `<ul style="margin: 0 0 16px 18px; padding: 0;">${normalizedDetails.map((line) => `<li>${line}</li>`).join('')}</ul>`
            : ''
        }
        ${safeShipmentUrl ? `<p><strong>Open in Portal:</strong> <a href="${safeShipmentUrl}">${safeShipmentUrl}</a></p>` : ''}
        <p>Regards,<br/>Royal Horizon</p>
      </div>
    `,
  });
}

async function sendStorageAllocationStatusEmail({
  to,
  userName,
  shipmentId,
  containerSerialNo,
  approvalStage,
  updatedBy,
  detailLines = [],
  shipmentUrl,
}) {
  const transporter = getTransporter();
  const { from } = getMailerConfig();
  const safeUserName = userName || 'Team';
  const safeShipmentId = shipmentId || 'N/A';
  const safeContainerSerialNo = containerSerialNo || 'N/A';
  const safeApprovalStage = approvalStage || 'Storage Allocation Updated';
  const safeUpdatedBy = updatedBy || 'A user';
  const safeShipmentUrl = shipmentUrl || '';
  const normalizedDetails = Array.isArray(detailLines)
    ? detailLines.filter((line) => String(line || '').trim().length > 0)
    : [];

  await transporter.sendMail({
    from,
    to,
    subject: `Storage Allocation Notification: ${safeApprovalStage}`,
    text: [
      `Dear ${safeUserName},`,
      '',
      `${safeUpdatedBy} updated the Storage Allocation workflow.`,
      `Shipment ID: ${safeShipmentId}`,
      `Container Serial No: ${safeContainerSerialNo}`,
      `Approval Stage: ${safeApprovalStage}`,
      ...(normalizedDetails.length ? ['', ...normalizedDetails] : []),
      ...(safeShipmentUrl ? ['', `Open in Portal: ${safeShipmentUrl}`] : []),
      '',
      'Regards,',
      'Royal Horizon',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
        <p>Dear ${safeUserName},</p>
        <p><strong>${safeUpdatedBy}</strong> updated the <strong>Storage Allocation</strong> workflow.</p>
        <p>
          <strong>Shipment ID:</strong> ${safeShipmentId}<br/>
          <strong>Container Serial No:</strong> ${safeContainerSerialNo}<br/>
          <strong>Approval Stage:</strong> ${safeApprovalStage}
        </p>
        ${
          normalizedDetails.length
            ? `<ul style="margin: 0 0 16px 18px; padding: 0;">${normalizedDetails.map((line) => `<li>${line}</li>`).join('')}</ul>`
            : ''
        }
        ${safeShipmentUrl ? `<p><strong>Open in Portal:</strong> <a href="${safeShipmentUrl}">${safeShipmentUrl}</a></p>` : ''}
        <p>Regards,<br/>Royal Horizon</p>
      </div>
    `,
  });
}

async function sendPaymentCostingStatusEmail({
  to,
  userName,
  shipmentId,
  containerSerialNo,
  approvalStage,
  updatedBy,
  detailLines = [],
  shipmentUrl,
}) {
  const transporter = getTransporter();
  const { from } = getMailerConfig();
  const safeUserName = userName || 'Team';
  const safeShipmentId = shipmentId || 'N/A';
  const safeContainerSerialNo = containerSerialNo || 'N/A';
  const safeApprovalStage = approvalStage || 'Payment Costing Updated';
  const safeUpdatedBy = updatedBy || 'A user';
  const safeShipmentUrl = shipmentUrl || '';
  const normalizedDetails = Array.isArray(detailLines)
    ? detailLines.filter((line) => String(line || '').trim().length > 0)
    : [];

  await transporter.sendMail({
    from,
    to,
    subject: `Payment Costing Notification: ${safeApprovalStage}`,
    text: [
      `Dear ${safeUserName},`,
      '',
      `${safeUpdatedBy} updated the Payment Costing workflow.`,
      `Shipment ID: ${safeShipmentId}`,
      `Container Serial No: ${safeContainerSerialNo}`,
      `Approval Stage: ${safeApprovalStage}`,
      ...(normalizedDetails.length ? ['', ...normalizedDetails] : []),
      ...(safeShipmentUrl ? ['', `Open in Portal: ${safeShipmentUrl}`] : []),
      '',
      'Regards,',
      'Royal Horizon',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
        <p>Dear ${safeUserName},</p>
        <p><strong>${safeUpdatedBy}</strong> updated the <strong>Payment Costing</strong> workflow.</p>
        <p>
          <strong>Shipment ID:</strong> ${safeShipmentId}<br/>
          <strong>Container Serial No:</strong> ${safeContainerSerialNo}<br/>
          <strong>Approval Stage:</strong> ${safeApprovalStage}
        </p>
        ${
          normalizedDetails.length
            ? `<ul style="margin: 0 0 16px 18px; padding: 0;">${normalizedDetails.map((line) => `<li>${line}</li>`).join('')}</ul>`
            : ''
        }
        ${safeShipmentUrl ? `<p><strong>Open in Portal:</strong> <a href="${safeShipmentUrl}">${safeShipmentUrl}</a></p>` : ''}
        <p>Regards,<br/>Royal Horizon</p>
      </div>
    `,
  });
}

module.exports = {
  sendSupplierInviteEmail,
  sendInternalUserInviteEmail,
  sendInternalUserPasswordResetEmail,
  sendWorkflowUpdateEmail,
  sendShipmentScheduledEmail,
  sendActualContainerSavedEmail,
  sendClearingAdvanceStatusEmail,
  sendPaymentAllocationStatusEmail,
  sendStorageAllocationStatusEmail,
  sendPaymentCostingStatusEmail,
};
