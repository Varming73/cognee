import classNames from "classnames";
import { useCallback, useEffect, useState } from "react";

import { fetch, isCloudEnvironment, useBoolean } from "@/utils";
import { checkCloudConnection } from "@/modules/cloud";
import { CaretIcon, CloseIcon, CloudIcon, LocalCogneeIcon } from "@/ui/Icons";
import { CTAButton, GhostButton, IconButton, Input, Modal } from "@/ui/elements";

import DatasetsAccordion, { DatasetsAccordionProps } from "./DatasetsAccordion";

type InstanceDatasetsAccordionProps = Omit<DatasetsAccordionProps, "title">;

export default function InstanceDatasetsAccordion({ onDatasetsChange }: InstanceDatasetsAccordionProps) {
  const {
    value: isLocalCogneeConnected,
    setTrue: setLocalCogneeConnected,
  } = useBoolean(false);

  const {
    value: isCloudCogneeConnected,
    setTrue: setCloudCogneeConnected,
  } = useBoolean(isCloudEnvironment());

  const checkConnectionToCloudCognee = useCallback((apiKey?: string) => {
      if (apiKey) {
        fetch.setApiKey(apiKey);
        console.log('[Cognee] API key set, verifying...');
        
        // Verify the key was actually saved
        const savedKey = fetch.getApiKey();
        if (!savedKey) {
          console.error('[Cognee] API key was not saved properly!');
          return Promise.reject({
            detail: 'Failed to save API key. Please check browser console for details.',
            status: 500
          });
        }
        console.log('[Cognee] API key verified in memory');
      }
      return checkCloudConnection()
        .then(() => {
          console.log('[Cognee] Cloud connection successful');
          setCloudCogneeConnected();
        })
        .catch((error) => {
          console.error('[Cognee] Cloud connection failed:', error);
          throw error;
        });
    }, [setCloudCogneeConnected]);

  useEffect(() => {
    const checkConnectionToLocalCognee = () => {
      fetch.checkHealth()
        .then(setLocalCogneeConnected)
    };

    checkConnectionToLocalCognee();
    checkConnectionToCloudCognee();
  }, [checkConnectionToCloudCognee, setCloudCogneeConnected, setLocalCogneeConnected]);

  const {
    value: isCloudConnectedModalOpen,
    setTrue: openCloudConnectionModal,
    setFalse: closeCloudConnectionModal,
  } = useBoolean(false);

  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showPersistenceTip, setShowPersistenceTip] = useState(false);
  const [connectedApiKey, setConnectedApiKey] = useState<string | null>(null);

  const handleCloudConnectionConfirm = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setConnectionError(null);
    setIsConnecting(true);

    const apiKeyValue = event.currentTarget.apiKey.value;

    checkConnectionToCloudCognee(apiKeyValue)
      .then(() => {
        setIsConnecting(false);
        setConnectedApiKey(apiKeyValue);
        
        // Show tip if key not from env
        if (!fetch.isApiKeyFromEnv()) {
          setShowPersistenceTip(true);
        }
        
        closeCloudConnectionModal();
      })
      .catch((error) => {
        setIsConnecting(false);
        const errorMessage = error?.detail || error?.message || "Failed to connect to cloud. Please check your API key and try again.";
        setConnectionError(errorMessage);
      });
  };

  const isCloudEnv = isCloudEnvironment();

  return (
    <div className={classNames("flex flex-col", {
      "flex-col-reverse": isCloudEnv,
    })}>
      <DatasetsAccordion
        title={(
          <div className="flex flex-row items-center justify-between">
            <div className="flex flex-row items-center gap-2">
              <LocalCogneeIcon className="text-indigo-700" />
              <span className="text-xs">local cognee</span>
            </div>
          </div>
        )}
        tools={isLocalCogneeConnected ? <span className="text-xs text-indigo-600">Connected</span> : <span className="text-xs text-gray-400">Not connected</span>}
        switchCaretPosition={true}
        className="pt-3 pb-1.5"
        contentClassName="pl-4"
        onDatasetsChange={!isCloudEnv ? onDatasetsChange : () => {}}
      />

      {showPersistenceTip && connectedApiKey && (
        <div className="mt-3 mb-2 p-4 bg-blue-50 border border-blue-200 rounded">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-900">
                💡 Make this connection permanent
              </p>
              <p className="mt-1 text-sm text-blue-700">
                Your API key is saved in the browser. To persist it across devices and enable backend sync, add this to your <code className="bg-blue-100 px-1 rounded">.env</code> file:
              </p>
              <div className="mt-2 p-2 bg-white rounded border border-blue-200 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <code className="text-gray-800">
                    COGNEE_CLOUD_AUTH_TOKEN="{connectedApiKey}"
                  </code>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(`COGNEE_CLOUD_AUTH_TOKEN="${connectedApiKey}"`);
                    }}
                    className="ml-2 px-2 py-1 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded"
                    title="Copy to clipboard"
                  >
                    📋
                  </button>
                </div>
              </div>
            </div>
            <button 
              onClick={() => setShowPersistenceTip(false)}
              className="ml-4 text-blue-400 hover:text-blue-600 flex-shrink-0"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {isCloudCogneeConnected ? (
        <DatasetsAccordion
          title={(
            <div className="flex flex-row items-center justify-between">
              <div className="flex flex-row items-center gap-2">
                <LocalCogneeIcon className="text-indigo-700" />
                <span className="text-xs">cloud cognee</span>
              </div>
            </div>
          )}
          tools={<span className="text-xs text-indigo-600">Connected</span>}
          switchCaretPosition={true}
          className="pt-3 pb-1.5"
          contentClassName="pl-4"
          onDatasetsChange={isCloudEnv ? onDatasetsChange : () => {}}
          useCloud={true}
        />
      ) : (
        <button className="w-full flex flex-row items-center justify-between py-1.5 cursor-pointer pt-3" onClick={!isCloudCogneeConnected ? openCloudConnectionModal : () => {}}>
          <div className="flex flex-row items-center gap-1.5">
            <CaretIcon className="rotate-[-90deg]" />
            <div className="flex flex-row items-center gap-2">
              <CloudIcon color="#000000" />
              <span className="text-xs">cloud cognee</span>
            </div>
          </div>
          <span className="text-xs text-gray-400">Not connected</span>
        </button>
      )}

      <Modal isOpen={isCloudConnectedModalOpen}>
        <div className="w-full max-w-2xl">
          <div className="flex flex-row items-center justify-between">
            <span className="text-2xl">Connect to cloud?</span>
            <IconButton onClick={closeCloudConnectionModal}><CloseIcon /></IconButton>
          </div>
          <div className="mt-8 mb-6">Please provide your API key. You can find it on <a className="!text-indigo-600" href="https://platform.cognee.ai">our platform.</a></div>
          <form onSubmit={handleCloudConnectionConfirm}>
            <div className="max-w-md">
              <Input name="apiKey" type="text" placeholder="cloud API key" required />
            </div>
            {connectionError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {connectionError}
              </div>
            )}
            <div className="flex flex-row gap-4 mt-4 justify-end">
              <GhostButton type="button" onClick={() => closeCloudConnectionModal()} disabled={isConnecting}>cancel</GhostButton>
              <CTAButton type="submit" disabled={isConnecting}>
                {isConnecting ? "Connecting..." : "connect"}
              </CTAButton>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
