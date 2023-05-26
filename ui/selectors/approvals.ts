import { ApprovalControllerState } from '@metamask/approval-controller';
import { ApprovalType } from '@metamask/controller-utils';
import { TransactionMeta } from '../../shared/constants/transaction';

type ApprovalsMetaMaskState = {
  metamask: {
    pendingApprovals: ApprovalControllerState['pendingApprovals'];
    approvalFlows: ApprovalControllerState['approvalFlows'];
    unapprovedTxs: {
      [transactionId: string]: TransactionMeta;
    };
  };
};

export const getApprovalRequestsByType = (
  state: ApprovalsMetaMaskState,
  approvalType: ApprovalType,
) => {
  const pendingApprovalRequests = Object.values(
    state.metamask.pendingApprovals,
  ).filter(({ type }) => type === approvalType);

  return pendingApprovalRequests;
};

export function hasPendingApprovals(
  state: ApprovalsMetaMaskState,
  approvalType: ApprovalType,
) {
  const pendingApprovalRequests = getApprovalRequestsByType(
    state,
    approvalType,
  );

  return pendingApprovalRequests.length > 0;
}

export function hasPendingApprovalFlows(state: ApprovalsMetaMaskState) {
  return state.metamask.approvalFlows.length > 0;
}
