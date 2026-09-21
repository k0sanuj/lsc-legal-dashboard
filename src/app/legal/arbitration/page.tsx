import { DisputeRegister } from '@/components/legal/dispute-register'

export default function ArbitrationPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <DisputeRegister kind="ARBITRATION" searchParams={props.searchParams} />
}
