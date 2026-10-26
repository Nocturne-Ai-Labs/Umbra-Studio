"""Keep Windows ComfyUI listening when an incoming client resets during AcceptEx.

CPython issue93821 documents the listener being closed on WinError64. Retry
that client-only failure inside accept, retaining Proactor subprocess support.
No stdlib files or event-loop policies are changed.
"""
import asyncio
import logging
import struct
import sys


def install_accept_retry():
    if sys.platform != "win32":
        return False
    import _overlapped
    from asyncio.windows_events import IocpProactor

    if getattr(IocpProactor.accept, "_umbra_accept_retry", False):
        return True
    for name in ("_get_accept_socket", "_register_with_iocp", "_register"):
        if not hasattr(IocpProactor, name):
            raise RuntimeError("Umbra Windows accept compatibility requires a supported CPython IOCP runtime.")

    def accept(proactor, listener):
        async def wait_for_client():
            while True:
                connection = proactor._get_accept_socket(listener.family)
                try:
                    proactor._register_with_iocp(listener)
                    operation = _overlapped.Overlapped(0)
                    operation.AcceptEx(listener.fileno(), connection.fileno())

                    def finish_accept(_transport, _key, completed):
                        completed.getresult()
                        import socket
                        connection.setsockopt(socket.SOL_SOCKET, _overlapped.SO_UPDATE_ACCEPT_CONTEXT,
                                              struct.pack("@P", listener.fileno()))
                        connection.settimeout(listener.gettimeout())
                        return connection, connection.getpeername()

                    return await proactor._register(operation, listener, finish_accept)
                except OSError as error:
                    connection.close()
                    if getattr(error, "winerror", None) != 64 or listener.fileno() == -1:
                        raise
                    # A reset client must not close the shared listening socket.
                    # Yield between attempts; cancellation remains interruptible.
                    await asyncio.sleep(0.01)
                except BaseException:
                    connection.close()
                    raise

        return proactor._loop.create_task(wait_for_client())

    accept._umbra_accept_retry = True
    IocpProactor.accept = accept
    logging.info("[Umbra] Windows accept-reset compatibility enabled (Proactor retained).")
    return True


install_accept_retry()
