// Global types used throughout the application

export interface BaseComponentProps {
  className?: string;
  children?: React.ReactNode;
}

export type Children = React.ReactNode;

export interface AsyncComponentProps extends BaseComponentProps {
  fallback?: React.ReactNode;
}

export interface ModalProps extends BaseComponentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface SelectableItem {
  id: string;
  name: string;
}

export interface SearchableItem extends SelectableItem {
  searchableText?: string;
}

export interface Timestamped {
  createdAt: Date;
  updatedAt?: Date;
}

export interface SoftDeletable {
  deletedAt?: Date;
  isDeleted: boolean;
}

export interface BaseEntity extends Timestamped, SoftDeletable {
  id: string;
}
