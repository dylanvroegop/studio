'use client';

import React, { useState, useRef } from 'react';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Upload, Trash2, Loader2, ImageIcon } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface LogoUploadProps {
  currentLogoUrl?: string;
  userId: string;
  onLogoChange: (url: string | null) => void;
  itemLabel?: string;
  storageKey?: string;
  recommendedText?: string;
}

export function LogoUpload({
  currentLogoUrl,
  userId,
  onLogoChange,
  itemLabel = 'Logo',
  storageKey = 'logo',
  recommendedText = 'Aanbevolen: 400x150px of een vergelijkbare verhouding',
}: LogoUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentLogoUrl || null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const validateFile = (file: File): string | null => {
    // Check file type
    if (!file.type.startsWith('image/')) {
      return 'Selecteer een afbeeldingsbestand (PNG, JPG of vergelijkbaar).';
    }

    // Check file size (2MB limit)
    const maxSize = 2 * 1024 * 1024; // 2MB in bytes
    if (file.size > maxSize) {
      return 'Bestandsgrootte moet onder 2MB blijven.';
    }

    return null;
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file
    const error = validateFile(file);
    if (error) {
      toast({
        title: 'Ongeldig bestand',
        description: error,
        variant: 'destructive',
      });
      return;
    }

    // Show preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    // Upload to Firebase Storage
    setIsUploading(true);
    try {
      const storage = getStorage();
      const fileExtension = file.name.split('.').pop() || 'png';
      const logoRef = ref(storage, `users/${userId}/${storageKey}.${fileExtension}`);

      await uploadBytes(logoRef, file);
      const downloadURL = await getDownloadURL(logoRef);

      // Clean up object URL
      URL.revokeObjectURL(objectUrl);
      setPreviewUrl(downloadURL);
      onLogoChange(downloadURL);

      toast({
        title: 'Opgeslagen',
        description: `${itemLabel} is succesvol geüpload.`,
      });
    } catch (error) {
      console.error('Error uploading logo:', error);
      // Revert preview
      setPreviewUrl(currentLogoUrl || null);
      toast({
        title: 'Upload mislukt',
        description: `Kon ${itemLabel.toLowerCase()} niet uploaden. Probeer het opnieuw.`,
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async () => {
    setIsUploading(true);
    try {
      // Try to delete from Firebase Storage
      // Note: We don't know the exact extension, so we'll just update Firestore
      // The old file will remain in storage but won't be referenced
      // In a production app, you might want to store the storage path in Firestore
      // and delete it properly

      setPreviewUrl(null);
      onLogoChange(null);

      toast({
        title: 'Verwijderd',
        description: `${itemLabel} is verwijderd.`,
      });
    } catch (error) {
      console.error('Error removing logo:', error);
      toast({
        title: 'Verwijderen mislukt',
        description: `Kon ${itemLabel.toLowerCase()} niet verwijderen. Probeer het opnieuw.`,
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      setShowDeleteDialog(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        {/* Preview Area */}
        <div className="flex-shrink-0">
          {previewUrl ? (
            <div className="relative w-[200px] h-[80px] border border-border rounded-md overflow-hidden bg-card flex items-center justify-center p-2">
              <img
                src={previewUrl}
                alt={itemLabel}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          ) : (
            <div className="w-[200px] h-[80px] border-2 border-dashed border-border rounded-md flex items-center justify-center bg-muted/30">
              <div className="text-center">
                <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-1 text-xs text-muted-foreground">Geen {itemLabel.toLowerCase()}</p>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex-1 space-y-2">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploaden...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  {previewUrl ? `${itemLabel} wijzigen` : `${itemLabel} uploaden`}
                </>
              )}
            </Button>

            {previewUrl && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
                disabled={isUploading}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Verwijderen
              </Button>
            )}
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <p>{recommendedText}</p>
            <p>Max. bestandsgrootte: 2MB • Formaten: PNG, JPG, GIF</p>
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{itemLabel} verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je deze {itemLabel.toLowerCase()} wilt verwijderen? Deze wordt niet meer gebruikt in nieuwe PDF-documenten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
